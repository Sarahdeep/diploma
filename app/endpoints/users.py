from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from database import get_db
from models import User, Observation, UserActivity
import schemas
from auth import get_current_active_user
from middleware.auth import user_required
from minio_client import delete_file, upload_file_object_and_get_url, AVATARS_BUCKET, MINIO_PUBLIC_URL, get_minio_url, OBSERVATIONS_BUCKET
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Users"],
    responses={404: {"description": "Not found"}},
)

@router.get("/me", response_model=schemas.UserProfile)
@user_required()
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get current user's profile"""
    
    observation_count = db.query(func.count(Observation.id)).filter(Observation.user_id == current_user.id).scalar() or 0
    
    last_observation = db.query(Observation.timestamp).filter(Observation.user_id == current_user.id).order_by(desc(Observation.timestamp)).first()
    last_observation_date = last_observation[0] if last_observation else None

    # Ensure profile exists, though it should have been created at registration
    profile_data = current_user.profile
    if not profile_data:
        # This case should ideally not happen if registration is correct
        # Fallback to empty data for profile-specific fields
        profile_data = schemas.UserProfileUpdate() # Use the Pydantic schema for default empty values

    user_profile_data = {
        # Fields from User model
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "role": current_user.role,
        "avatar_url": current_user.avatar_url,
        "is_active": current_user.is_active,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at,
        "last_login": current_user.last_login,
        # Calculated fields
        "observation_count": observation_count,
        "last_observation_date": last_observation_date,
        # Fields from UserProfile model (via current_user.profile)
        "bio": profile_data.bio if hasattr(profile_data, 'bio') else None,
        "location": profile_data.location if hasattr(profile_data, 'location') else None,
        "website": profile_data.website if hasattr(profile_data, 'website') else None,
        "social_links": profile_data.social_links if hasattr(profile_data, 'social_links') else {},
        "preferences": profile_data.preferences if hasattr(profile_data, 'preferences') else {},
        "notification_settings": profile_data.notification_settings if hasattr(profile_data, 'notification_settings') else {}
    }
    
    return schemas.UserProfile(**user_profile_data)

@router.api_route("/me", methods=["PUT", "PATCH"], response_model=schemas.UserProfile)
@user_required()
async def update_current_user_profile(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    username: Optional[str] = Form(None),
    avatar: Optional[UploadFile] = File(None),
    profile_update: Optional[schemas.UserProfileUpdate] = None
):
    """Update current user's profile, including username and avatar."""
    
    # Re-fetch the user using the current session to ensure it's attached
    # This overwrites the 'current_user' from Depends with a session-attached instance
    fetched_user = db.query(User).filter(User.id == current_user.id).first()
    if not fetched_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    current_user = fetched_user # Assign the fetched user back to current_user

    updated_fields = False

    if username is not None and username.strip() != "" and username.strip() != current_user.username:
        current_user.username = username.strip()
        updated_fields = True

    if avatar is not None:
        if not avatar.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Generate unique filename within the avatars bucket structure
        file_extension = avatar.filename.split('.')[-1]
        # object_name will be like: user_id/uuid.extension (no leading slash, no bucket name)
        object_name_in_bucket = f"{current_user.id}/{uuid.uuid4()}.{file_extension}"
        
        # Upload to MinIO using the new function
        # The avatar.file is a SpooledTemporaryFile, which is a BinaryIO
        file_url = await upload_file_object_and_get_url(
            file_data=avatar.file, 
            object_name=object_name_in_bucket, 
            content_type=avatar.content_type,
            bucket_name=AVATARS_BUCKET
        )

        if not file_url:
            # Log the error or raise a more specific one if upload_file_object_and_get_url returns None
            print(f"Failed to upload avatar for user {current_user.id}. file_url is None.")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not upload avatar.")

        # Delete old avatar if exists
        if current_user.avatar_url:
            try:
                # Extract object name from the FULL old URL
                # Assumes MINIO_PUBLIC_URL/AVATARS_BUCKET/object_name_in_bucket structure
                # Example: http://localhost:9000/avatars/user_id/old_image.png
                # We need to extract "user_id/old_image.png" to pass to delete_file
                old_avatar_public_url_prefix = f"{MINIO_PUBLIC_URL.rstrip('/')}/{AVATARS_BUCKET.strip('/')}/"
                if current_user.avatar_url.startswith(old_avatar_public_url_prefix):
                    old_object_name_in_bucket = current_user.avatar_url[len(old_avatar_public_url_prefix):]
                    await delete_file(AVATARS_BUCKET, old_object_name_in_bucket) # Pass bucket and object name
                else:
                    # Log if the URL format is unexpected, makes deletion harder
                    print(f"Old avatar URL format unexpected, cannot reliably delete: {current_user.avatar_url}")
            except Exception as e:
                print(f"Error deleting old avatar: {e}") 
                pass 
        
        current_user.avatar_url = file_url
        updated_fields = True

    # Handle other profile fields if profile_update is provided
    # This part might need adjustment if profile_update comes from FormData too
    # For now, assuming it's separate JSON body (which won't work with FormData directly)
    # If the frontend sends all as FormData, you'll need to extract them with Form(...) too.
    # For simplicity, this example assumes UserProfileUpdate fields are not sent when avatar/username is.
    # If they ARE sent via FormData, you need to add them as Form(...) parameters as well.
    # e.g. bio: Optional[str] = Form(None), location: Optional[str] = Form(None), etc.
    # For now, the UserProfileUpdate part is kept as is, but it might not be hit if Content-Type is multipart/form-data
    # If the frontend sends all as FormData, you'll need to extract them with Form(...) too.
    # For simplicity, this example assumes UserProfileUpdate fields are not sent when avatar/username is.
    # If they ARE sent via FormData, you need to add them as Form(...) parameters as well.
    # e.g. bio: Optional[str] = Form(None), location: Optional[str] = Form(None), etc.
    # For now, the UserProfileUpdate part is kept as is, but it might not be hit if Content-Type is multipart/form-data
    if profile_update:
        for field, value in profile_update.dict(exclude_unset=True).items():
            if hasattr(current_user, field): # Check if the field exists on the User model directly
                setattr(current_user, field, value)
                updated_fields = True
            elif hasattr(current_user.profile, field): # Check if the field exists on the related UserProfile model
                setattr(current_user.profile, field, value)
                updated_fields = True
    
    if updated_fields:
        db.commit()
        db.refresh(current_user)
        if current_user.profile: # Refresh profile if it exists and might have been updated
             db.refresh(current_user.profile)

    # Re-fetch the comprehensive profile to return
    observation_count = db.query(func.count(Observation.id)).filter(Observation.user_id == current_user.id).scalar() or 0
    last_observation = db.query(Observation.timestamp).filter(Observation.user_id == current_user.id).order_by(desc(Observation.timestamp)).first()
    last_observation_date = last_observation[0] if last_observation else None
    
    profile_model_data = current_user.profile

    # Determine the avatar_url for the response:
    # Start with the value from the (potentially refreshed) current_user object.
    response_avatar_url = current_user.avatar_url 
    # If an avatar was uploaded in *this specific request* and we got a file_url,
    # use that file_url for the response, as it's the most direct information.
    if avatar is not None and 'file_url' in locals() and file_url is not None:
        response_avatar_url = file_url
    
    user_profile_data_dict = {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "role": current_user.role,
        "avatar_url": response_avatar_url, # Use the determined response_avatar_url
        "is_active": current_user.is_active,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at,
        "last_login": current_user.last_login,
        "observation_count": observation_count,
        "last_observation_date": last_observation_date,
        "bio": profile_model_data.bio if profile_model_data and hasattr(profile_model_data, 'bio') else None,
        "location": profile_model_data.location if profile_model_data and hasattr(profile_model_data, 'location') else None,
        "website": profile_model_data.website if profile_model_data and hasattr(profile_model_data, 'website') else None,
        "social_links": profile_model_data.social_links if profile_model_data and hasattr(profile_model_data, 'social_links') else {},
        "preferences": profile_model_data.preferences if profile_model_data and hasattr(profile_model_data, 'preferences') else {},
        "notification_settings": profile_model_data.notification_settings if profile_model_data and hasattr(profile_model_data, 'notification_settings') else {}
    }
    return schemas.UserProfile(**user_profile_data_dict)

@router.get("/{user_id}/profile", response_model=schemas.PublicUserProfile)
async def get_public_user_profile(
    user_id: int,
    db: Session = Depends(get_db)
):
    logger.info(f"Attempting to fetch public profile for user_id: {user_id}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.warning(f"User not found in DB for user_id: {user_id}. Raising 404.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    logger.info(f"User found: {user.username} (ID: {user.id}). Preparing profile data.")
    
    observation_count = db.query(func.count(Observation.id)).filter(Observation.user_id == user_id).scalar() or 0
    last_observation = db.query(Observation.timestamp).filter(Observation.user_id == user_id).order_by(desc(Observation.timestamp)).first()
    last_observation_date = last_observation[0] if last_observation else None
    profile_data_model = user.profile

    logger.info(f"User's raw profile model data from user.profile: {profile_data_model.bio if profile_data_model else 'No profile model'}")

    public_profile_data = {
        "id": user.id,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at,
        "role": user.role, 
        "observation_count": observation_count,
        "last_observation_date": last_observation_date,
        "bio": profile_data_model.bio if profile_data_model and hasattr(profile_data_model, 'bio') else None,
        "location": profile_data_model.location if profile_data_model and hasattr(profile_data_model, 'location') else None,
        "website": profile_data_model.website if profile_data_model and hasattr(profile_data_model, 'website') else None,
        "social_links": profile_data_model.social_links if profile_data_model and hasattr(profile_data_model, 'social_links') else {},
    }
    logger.info(f"Constructed public_profile_data dict for user_id {user_id}: {public_profile_data}")

    try:
        response_model = schemas.PublicUserProfile(**public_profile_data)
        logger.info(f"Successfully validated data against PublicUserProfile schema for user_id {user_id}.")
        return response_model
    except Exception as e:
        logger.error(f"Error during Pydantic validation for PublicUserProfile for user_id {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error processing user profile data.")

@router.get("/me/statistics", response_model=schemas.UserStatistics)
@user_required()
async def get_user_statistics(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user statistics"""
    # Get observation counts
    total_observations = db.query(Observation).filter(Observation.user_id == current_user.id).count()
    total_uploads = db.query(Observation).filter(
        Observation.user_id == current_user.id,
        Observation.image_url.isnot(None)
    ).count()
    total_edits = db.query(UserActivity).filter(
        UserActivity.user_id == current_user.id,
        UserActivity.activity_type == "edit_observation"
    ).count()
    
    # Get last activity
    last_activity = db.query(UserActivity).filter(
        UserActivity.user_id == current_user.id
    ).order_by(desc(UserActivity.created_at)).first()
    
    # Get activity by type
    activity_by_type = {}
    for activity in db.query(
        UserActivity.activity_type,
        func.count(UserActivity.id)
    ).filter(
        UserActivity.user_id == current_user.id
    ).group_by(UserActivity.activity_type).all():
        activity_by_type[activity[0]] = activity[1]
    
    # Get recent activities
    recent_activities = db.query(UserActivity).filter(
        UserActivity.user_id == current_user.id
    ).order_by(desc(UserActivity.created_at)).limit(10).all()
    
    statistics_data = {
        "total_observations": total_observations,
        "total_uploads": total_uploads,
        "total_edits": total_edits,
        "last_activity": last_activity.created_at if last_activity else None,
        "activity_by_type": activity_by_type,
        "recent_activities": recent_activities
    }
    
    return schemas.UserStatistics(**statistics_data)

@router.get("/me/observations", response_model=schemas.ObservationListResponse)
@user_required()
async def get_user_observations(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get current user's observations with pagination."""
    
    query = db.query(Observation).filter(Observation.user_id == current_user.id)
    
    total_count = query.count() 
    
    db_observations = query.order_by(desc(Observation.timestamp)).offset(skip).limit(limit).all()
    
    # Process observations to include the full MinIO URL
    response_observations = []
    for db_obs in db_observations:
        pydantic_obs = schemas.ObservationRead.from_orm(db_obs) # Convert to Pydantic model
        if db_obs.image_url: # db_obs.image_url here is the object name stored in DB
            # Construct the full, potentially presigned URL for the response
            pydantic_obs.image_url = get_minio_url(OBSERVATIONS_BUCKET, db_obs.image_url)
        else:
            pydantic_obs.image_url = None # Explicitly set to None if no object name
        response_observations.append(pydantic_obs)
    
    return {
        "observations": response_observations, # Return the list of processed Pydantic models
        "total_count": total_count
    }

@router.get("/{user_id}/observations", response_model=schemas.ObservationListResponse)
async def get_user_observations_by_id(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    logger.info(f"Attempting to fetch observations for user_id: {user_id}, skip: {skip}, limit: {limit}")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.warning(f"User not found in DB for user_id: {user_id} when fetching observations. Raising 404.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found, cannot fetch observations.")

    logger.info(f"User {user.username} (ID: {user.id}) found. Fetching observations.")
    
    query = db.query(Observation).filter(Observation.user_id == user_id)
    total_count = query.count()
    db_observations = query.order_by(desc(Observation.timestamp)).offset(skip).limit(limit).all()
    
    logger.info(f"Found {total_count} observations for user_id {user_id}. Returning {len(db_observations)} observations for this page.")

    processed_observations = []
    for db_obs in db_observations:
        pydantic_obs = schemas.ObservationRead.from_orm(db_obs)
        if db_obs.image_url: # Check the original ORM field for the object name
            # Construct the full URL using the object name from the database
            pydantic_obs.image_url = get_minio_url(OBSERVATIONS_BUCKET, db_obs.image_url)
        else:
            pydantic_obs.image_url = None # Ensure it's explicitly None if no object name
        processed_observations.append(pydantic_obs)

    try:
        # Ensure observations_data is a list of Pydantic models if your schema expects that,
        # or that it's directly usable by schemas.ObservationListResponse
        response_model = schemas.ObservationListResponse(observations=processed_observations, total_count=total_count)
        logger.info(f"Successfully validated data against ObservationListResponse schema for user_id {user_id}.")
        return response_model
    except Exception as e:
        logger.error(f"Error during Pydantic validation for ObservationListResponse for user_id {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error processing user observations data.") 