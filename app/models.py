from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, func, Float, JSON, Boolean, Enum
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from database import Base
from datetime import datetime as dt, timezone
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    avatar_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=dt.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=dt.now(timezone.utc), onupdate=dt.now(timezone.utc), nullable=False)
    last_login = Column(DateTime, nullable=True)
    
    # Relationships
    observations = relationship("Observation", back_populates="user", cascade="all, delete-orphan")
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    activities = relationship("UserActivity", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User {self.email}>"

class UserProfile(Base):
    __tablename__ = "user_profiles"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    bio = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    website = Column(String, nullable=True)
    social_links = Column(JSON, nullable=True)  # Store social media links as JSON
    preferences = Column(JSON, nullable=True)   # Store user preferences as JSON
    notification_settings = Column(JSON, nullable=True)  # Store notification preferences
    created_at = Column(DateTime, default=dt.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=dt.now(timezone.utc), onupdate=dt.now(timezone.utc), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="profile")
    
    def __repr__(self):
        return f"<UserProfile {self.user_id}>"

class UserActivity(Base):
    __tablename__ = "user_activities"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    activity_type = Column(String, nullable=False)  # e.g., 'login', 'upload', 'edit', etc.
    activity_data = Column(JSON, nullable=True)    # Additional data about the activity
    ip_address = Column(String, nullable=True)     # Store IP for security tracking
    user_agent = Column(String, nullable=True)     # Store user agent for analytics
    created_at = Column(DateTime, default=dt.now(timezone.utc), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="activities")
    
    def __repr__(self):
        return f"<UserActivity {self.id} - {self.activity_type}>"

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
    is_verified = Column(Boolean, default=False, nullable=False)

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