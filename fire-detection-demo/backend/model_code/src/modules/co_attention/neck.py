"""
Neck Spatial Relations Co-Attention (SRC) module definitions for yolo26n_p2_src.pt.
Re-exports SpatialRelationCoAttention as NeckSpatialRelationCoAttention and
CrossDirection as _CrossDirection, and registers them into Ultralytics.
"""
import ultralytics.nn.modules as modules
import ultralytics.nn.tasks as tasks
from src_coattention import SpatialRelationCoAttention, CrossDirection


_CrossDirection = CrossDirection


class NeckSpatialRelationCoAttention(SpatialRelationCoAttention):
    pass


def register_neck_src():
    setattr(modules, "NeckSpatialRelationCoAttention", NeckSpatialRelationCoAttention)
    setattr(tasks, "NeckSpatialRelationCoAttention", NeckSpatialRelationCoAttention)
    setattr(modules, "_CrossDirection", _CrossDirection)
    setattr(tasks, "_CrossDirection", _CrossDirection)


register_neck_src()

__all__ = [
    "NeckSpatialRelationCoAttention",
    "_CrossDirection",
    "register_neck_src",
]
