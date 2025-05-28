from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from database import get_db
from models import User, UserActivity, Observation, Species
import schemas
from auth import get_current_active_user
from middleware.auth import admin_required
from datetime import datetime

router = APIRouter(
    tags=["Admin"],
    responses={404: {"description": "Not found"}},
)

# User Management Endpoints
@router.get("/users", response_model=List[schemas.UserRead])
@admin_required()
async def list_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_verified: Optional[bool] = None,
    created_at_start: Optional[datetime] = Query(None, description="Filter users created on or after this date"),
    created_at_end: Optional[datetime] = Query(None, description="Filter users created on or before this date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List all users with filtering and pagination.
    Only accessible by admin users.
    Excludes the current admin user from the list.
    """
    query = db.query(User)
    
    # Exclude the current admin user from the list
    if current_user:
        query = query.filter(User.id != current_user.id)
            
    # Apply filters
    if search:
        search = f"%{search}%"
        query = query.filter(
            (User.email.ilike(search)) |
            (User.username.ilike(search))
        )
    
    if role:
        query = query.filter(User.role == role)
    
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    
    if is_verified is not None:
        query = query.filter(User.is_verified == is_verified)
    
    if created_at_start:
        query = query.filter(User.created_at >= created_at_start)
    
    if created_at_end:
        query = query.filter(User.created_at <= created_at_end)
    
    # Apply pagination
    total = query.count()
    users = query.order_by(desc(User.created_at)).offset(skip).limit(limit).all()
    
    return users

@router.get("/users/{user_id}", response_model=schemas.UserRead)
@admin_required()
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get detailed information about a specific user.
    Only accessible by admin users.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

@router.put("/users/{user_id}", response_model=schemas.UserRead)
@admin_required()
async def update_user(
    user_id: int,
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update user information.
    Only accessible by admin users.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update user fields
    for field, value in user_update.dict(exclude_unset=True).items():
        setattr(user, field, value)
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    return user

@router.delete("/users/{user_id}")
@admin_required()
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a user.
    Only accessible by admin users.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    db.delete(user)
    db.commit()
    
    return {"message": "User deleted successfully"}

@router.post("/users/{user_id}/activate")
@admin_required()
async def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Activate a user account.
    Only accessible by admin users.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.is_active = True
    user.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "User activated successfully"}

@router.post("/users/{user_id}/deactivate")
@admin_required()
async def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Deactivate a user account.
    Only accessible by admin users.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent self-deactivation
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )
    
    user.is_active = False
    user.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "User deactivated successfully"}

@router.get("/users/{user_id}/activities", response_model=List[schemas.UserActivityRead])
@admin_required()
async def get_user_activities(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    activity_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get user activity history.
    Only accessible by admin users.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    query = db.query(UserActivity).filter(UserActivity.user_id == user_id)
    
    # Apply filters
    if activity_type:
        query = query.filter(UserActivity.activity_type == activity_type)
    
    if start_date:
        query = query.filter(UserActivity.created_at >= start_date)
    
    if end_date:
        query = query.filter(UserActivity.created_at <= end_date)
    
    # Apply pagination
    activities = query.order_by(desc(UserActivity.created_at)).offset(skip).limit(limit).all()
    
    return activities

@router.get("/statistics", response_model=schemas.AdminStatistics)
@admin_required()
async def get_admin_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get system-wide statistics.
    Only accessible by admin users.
    """
    # Get user statistics
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    verified_users = db.query(User).filter(User.is_verified == True).count()
    admin_users = db.query(User).filter(User.role == "admin").count()
    
    # Get observation and species statistics
    total_observations = db.query(Observation).count()
    total_species = db.query(Species).count()

    # Get activity statistics
    total_activities = db.query(UserActivity).count()
    recent_activities = db.query(UserActivity).order_by(desc(UserActivity.created_at)).limit(10).all()
    
    # Get activity by type
    activity_by_type = {}
    for activity in db.query(
        UserActivity.activity_type,
        func.count(UserActivity.id)
    ).group_by(UserActivity.activity_type).all():
        activity_by_type[activity[0]] = activity[1]
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "verified_users": verified_users,
        "admin_users": admin_users,
        "total_observations": total_observations,
        "total_species": total_species,
        "total_activities": total_activities,
        "activity_by_type": activity_by_type,
        "recent_activities": recent_activities
    } 