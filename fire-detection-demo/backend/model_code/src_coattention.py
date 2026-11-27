"""
Spatial Relations Co-Attention (SRC) module definitions and registrations.
Compatible with:
1. best_seed0_src.pt (SRCDetectionModel, SpatialRelationCoAttention, P2WithSRC, CrossDirection)
2. src_ratio8.pt (SpatialRelationalCoAttention)
3. yolo26ncombineddataset.pt (Standard YOLO26n)
"""
from copy import deepcopy
import math
import torch
from torch import nn
from torch.nn import functional as F
import ultralytics.nn.modules as modules
import ultralytics.nn.tasks as tasks
from ultralytics.nn.tasks import DetectionModel

def grid_xy(h, w, device, dtype):
    y, x = torch.meshgrid(
        (torch.arange(h, device=device, dtype=dtype) + 0.5) / h,
        (torch.arange(w, device=device, dtype=dtype) + 0.5) / w,
        indexing='ij'
    )
    return torch.stack((x, y), -1).reshape(-1, 2)


class CrossDirection(nn.Module):
    """Q from target branch; K/V exclusively from the other branch."""
    def __init__(self, dim=32, heads=4, grid=8, chunk=1024):
        super().__init__()
        assert dim % heads == 0
        self.heads, self.grid, self.chunk = heads, grid, chunk
        self.q = nn.Conv2d(dim, dim, 1, bias=False)
        self.k = nn.Conv2d(dim, dim, 1, bias=False)
        self.v = nn.Conv2d(dim, dim, 1, bias=False)
        self.out = nn.Conv2d(dim, dim, 1, bias=False)
        self.distance_scale = nn.Parameter(torch.zeros(heads))

    def forward(self, target, source, source_gate):
        b, d, h, w = target.shape
        gh, gw = min(self.grid, h), min(self.grid, w)
        source = F.adaptive_avg_pool2d(source, (gh, gw))
        gate = F.adaptive_avg_pool2d(source_gate, (gh, gw))
        def tokens(t):
            return t.flatten(2).transpose(1, 2).reshape(b, -1, self.heads, d // self.heads).transpose(1, 2)
        q, k, v = tokens(self.q(target)), tokens(self.k(source)), tokens(self.v(source))
        xy_q = grid_xy(h, w, q.device, torch.float32)
        xy_k = grid_xy(gh, gw, q.device, torch.float32)
        log_gate = gate.float().flatten(2).clamp_min(1e-4).log().unsqueeze(1)
        chunks = []
        for start in range(0, h * w, self.chunk):
            dist = (xy_q[start:start + self.chunk, None] - xy_k[None]).square().sum(-1)
            bias = -F.softplus(self.distance_scale.float())[None, :, None, None] * dist[None, None]
            bias = (bias + log_gate).to(q.dtype)
            chunks.append(F.scaled_dot_product_attention(
                q[:, :, start:start + self.chunk], k, v, attn_mask=bias, dropout_p=0.0
            ))
        context = torch.cat(chunks, 2).transpose(1, 2).reshape(b, h * w, d).transpose(1, 2).reshape(b, d, h, w)
        presence = source_gate.amax((2, 3), keepdim=True)
        return self.out(context) * presence


class SpatialRelationCoAttention(nn.Module):
    def __init__(self, channels=32, dim=32, heads=4, grid=8, chunk=1024):
        super().__init__()
        self.fire = nn.Sequential(nn.Conv2d(channels, dim, 1), nn.GroupNorm(4, dim), nn.SiLU())
        self.smoke = nn.Sequential(nn.Conv2d(channels, dim, 1), nn.GroupNorm(4, dim), nn.SiLU())
        self.fire_gate = nn.Conv2d(dim, 1, 1)
        self.smoke_gate = nn.Conv2d(dim, 1, 1)
        self.fire_from_smoke = CrossDirection(dim, heads, grid, chunk)
        self.smoke_from_fire = CrossDirection(dim, heads, grid, chunk)
        self.fuse = nn.Conv2d(dim * 2, channels, 1, bias=False)
        self.gamma = nn.Parameter(torch.tensor(1e-3))
        self.collect_aux = False
        self.aux_logits = None

    def forward(self, x):
        fire, smoke = self.fire(x), self.smoke(x)
        lf, ls = self.fire_gate(fire), self.smoke_gate(smoke)
        gf, gs = lf.sigmoid(), ls.sigmoid()
        if getattr(self, "collect_aux", False):
            self.aux_logits = torch.cat((lf, ls), 1)
        fire, smoke = fire * gf, smoke * gs
        cf = self.fire_from_smoke(fire, smoke, gs)
        cs = self.smoke_from_fire(smoke, fire, gf)
        return x + self.gamma * self.fuse(torch.cat((cf * gf, cs * gs), 1))


class P2WithSRC(nn.Module):
    def __init__(self, base, config):
        super().__init__()
        self.base = base
        ch_count = base.cv2.conv.out_channels if hasattr(base, 'cv2') else 32
        self.src = SpatialRelationCoAttention(ch_count, **config)
        for name in ('i', 'f', 'type', 'np'):
            if hasattr(base, name):
                setattr(self, name, getattr(base, name))
        self.type = 'P2WithSpatialRelationCoAttention'
        self.np = sum(p.numel() for p in self.parameters())

    def forward(self, x):
        return self.src(self.base(x))


class SRCDetectionModel(DetectionModel):
    pass


# Re-export and import legacy SpatialRelationalCoAttention from src.modules.attention.src
try:
    from src.modules.attention.src import SpatialRelationalCoAttention
except ImportError:
    SpatialRelationalCoAttention = SpatialRelationCoAttention


def register_src():
    setattr(modules, 'SpatialRelationCoAttention', SpatialRelationCoAttention)
    setattr(tasks, 'SpatialRelationCoAttention', SpatialRelationCoAttention)
    setattr(modules, 'SpatialRelationalCoAttention', SpatialRelationalCoAttention)
    setattr(tasks, 'SpatialRelationalCoAttention', SpatialRelationalCoAttention)
    setattr(modules, 'P2WithSRC', P2WithSRC)
    setattr(tasks, 'P2WithSRC', P2WithSRC)
    setattr(modules, 'CrossDirection', CrossDirection)
    setattr(tasks, 'CrossDirection', CrossDirection)
    setattr(tasks, 'SRCDetectionModel', SRCDetectionModel)

register_src()

__all__ = [
    "CrossDirection",
    "SpatialRelationCoAttention",
    "SpatialRelationalCoAttention",
    "P2WithSRC",
    "SRCDetectionModel",
    "register_src",
]
