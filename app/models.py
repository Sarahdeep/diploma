from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, func, Float, JSON
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from database import Base
from datetime import datetime as dt, timezone

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)

class Species(Base):
    __tablename__ = "species"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    description = Column(Text, nullable=True)
    
    observations = relationship(
        "Observation",
        back_populates="species",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    habitat_areas = relationship(
        "HabitatArea",
        back_populates="species",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

class Observation(Base):
    __tablename__ = "observations"
    id = Column(Integer, primary_key=True)
    
    location = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False, index=True)
    
    species_id = Column(Integer, ForeignKey("species.id", ondelete="CASCADE"))
    
    timestamp = Column(DateTime, nullable=False, default=dt.now(timezone.utc), index=True)

    image_url = Column(String, nullable=True)
    source = Column(String, nullable=False, default='unknown')
    image_metadata = Column(JSON, nullable=True)
    classification_confidence = Column(Float, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=dt.now(timezone.utc))

    species = relationship("Species", back_populates="observations")
    user = relationship("User")

class HabitatArea(Base):
    __tablename__ = "habitat_areas"
    id = Column(Integer, primary_key=True)
    species_id = Column(Integer, ForeignKey("species.id", ondelete="CASCADE"), nullable=False)
    method = Column(String, nullable=False)
    polygon = Column(Geometry(geometry_type='POLYGON', srid=4326), nullable=False)
    parameters = Column(JSON, nullable=True)
    calculated_at = Column(DateTime, default=dt.now(timezone.utc))
    source_observation_count = Column(Integer, nullable=True)

    species = relationship("Species", back_populates="habitat_areas")