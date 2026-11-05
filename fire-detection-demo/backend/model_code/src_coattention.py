"""
Spatial Relations Co-Attention (SRC) module re-export and registration.
"""
from src.modules.attention.src import SpatialRelationalCoAttention, register_src

__all__ = ["SpatialRelationalCoAttention", "register_src"]

