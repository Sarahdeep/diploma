from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from database import SessionLocal
from models import User, UserActivity, UserProfile
import schemas
import os
import secrets
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from pydantic import EmailStr
import json

router = APIRouter(
    tags=["Authentication"],
    responses={404: {"description": "Not found"}},
)

# Security configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your_fallback_secret_key_for_development_only")
REFRESH_SECRET_KEY = os.getenv("REFRESH_SECRET_KEY", "your_fallback_refresh_secret_key_for_development_only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 15
EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS = 24
DISABLE_AUTH = os.getenv("DISABLE_AUTH", "false").lower() == "true"  # Set to "true" to disable authentication
REFRESH_TOKEN_COOKIE_NAME = "jid" # Choose a name for your refresh token cookie

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Email configuration
email_conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", "test@example.com"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", "testpassword"),
    MAIL_FROM=os.getenv("MAIL_FROM", "test@example.com"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", "587")),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.example.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True
)

# Disable email sending if no mail server is configured
EMAIL_ENABLED = bool(os.getenv("MAIL_SERVER"))

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Password functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# Token functions
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, REFRESH_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_password_reset_token(email: str) -> str:
    to_encode = {"sub": email, "type": "password_reset"}
    expire = datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_email_verification_token(email: str) -> str:
    to_encode = {"sub": email, "type": "email_verification"}
    expire = datetime.utcnow() + timedelta(hours=EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# User verification functions
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if DISABLE_AUTH:
        # Return a default admin user for testing
        return db.query(User).filter(User.email == "test@example.com").first() or User(
            email="test@example.com",
            is_active=True,
            role="admin"
        )
        
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email_from_token: str = payload.get("sub")
        if email_from_token is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email_from_token)
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.email == token_data.email).first()
    
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_admin_user(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user

# Email functions
async def send_email_async(email: str, subject: str, body: str):
    if not EMAIL_ENABLED:
        print(f"Email disabled. Would have sent to {email}: {subject}")
        return
        
    message = MessageSchema(
        subject=subject,
        recipients=[email],
        body=body,
        subtype="html"
    )
    fm = FastMail(email_conf)
    await fm.send_message(message)

async def send_verification_email(email: str, token: str, background_tasks: BackgroundTasks):
    verification_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/verify-email?token={token}"
    body = f"""
    <html>
        <body>
            <h1>Email Verification</h1>
            <p>Please click the link below to verify your email address:</p>
            <a href="{verification_url}">Verify Email</a>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_async, email, "Verify your email", body)

async def send_password_reset_email(email: str, token: str, background_tasks: BackgroundTasks):
    reset_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token={token}"
    body = f"""
    <html>
        <body>
            <h1>Password Reset</h1>
            <p>Please click the link below to reset your password:</p>
            <a href="{reset_url}">Reset Password</a>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_async, email, "Reset your password", body)

# Activity tracking
async def log_activity(
    db: Session,
    user_id: int,
    activity_type: str,
    request: Request,
    activity_data: Optional[Dict[str, Any]] = None
):
    activity = UserActivity(
        user_id=user_id,
        activity_type=activity_type,
        activity_data=activity_data,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent")
    )
    db.add(activity)
    db.commit()

# Authentication endpoints
@router.post("/login", response_model=schemas.AccessTokenResponse)
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    request: Request = None
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Create tokens
    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    refresh_token_value = create_refresh_token(data={"sub": user.email})
    
    # Log activity
    await log_activity(db, user.id, "login", request)
    
    # Set refresh token in HttpOnly cookie
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token_value,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60, # in seconds
        expires=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/", # Make cookie available for all paths
        # secure=True,  # UNCOMMENT IN PRODUCTION (requires HTTPS)
        # samesite="lax" # Or "strict" for more CSRF protection
        samesite="lax" if not os.getenv("DEV_MODE") else "none", # Lax for prod, none for http dev if needed with secure=false
        secure=True if not os.getenv("DEV_MODE") else False # Secure for prod, false for http dev
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

@router.post("/refresh", response_model=schemas.AccessTokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    incoming_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    if not incoming_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    try:
        payload = jwt.decode(incoming_refresh_token, REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token content"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive for refresh token"
        )
    
    # Create new tokens
    new_access_token = create_access_token(data={"sub": user.email, "role": user.role})
    new_refresh_token_value = create_refresh_token(data={"sub": user.email})
    
    # Log activity
    await log_activity(db, user.id, "token_refresh", request)
    
    # Set new refresh token in HttpOnly cookie
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=new_refresh_token_value,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        expires=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
        samesite="lax" if not os.getenv("DEV_MODE") else "none",
        secure=True if not os.getenv("DEV_MODE") else False
    )
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }

@router.post("/register", response_model=schemas.UserRead)
async def register_user(
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    request: Request = None
):
    # Check if user exists
    db_user = db.query(User).filter(User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if username is taken
    db_user = db.query(User).filter(User.username == user_data.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        is_verified=False
    )
    # Create and associate UserProfile instance
    new_user.profile = UserProfile() 
    
    db.add(new_user) # new_user.profile will be added by cascade
    db.commit()
    db.refresh(new_user)
    if new_user.profile: # Should exist due to creation above
        db.refresh(new_user.profile)

    # Diagnostic: Verify user is retrievable immediately and ID is populated
    retrieved_user_check = db.query(User).filter(User.id == new_user.id).first()
    if not retrieved_user_check:
        pass # Or log to a proper logger if you have one
    else:
        pass # Or log to a proper logger
    
    # Send verification email
    verification_token = create_email_verification_token(new_user.email)
    await send_verification_email(new_user.email, verification_token, background_tasks)
    
    # Re-enable log_activity
    await log_activity(db, new_user.id, "register", request)
    
    return new_user

@router.post("/verify-email")
async def verify_email(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if email is None or token_type != "email_verification":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.is_verified = True
    db.commit()
    
    return {"message": "Email verified successfully"}

@router.post("/forgot-password")
async def forgot_password(
    email: EmailStr,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Don't reveal that the user doesn't exist
        return {"message": "If your email is registered, you will receive a password reset link"}
    
    reset_token = create_password_reset_token(email)
    await send_password_reset_email(email, reset_token, background_tasks)
    
    return {"message": "If your email is registered, you will receive a password reset link"}

@router.post("/reset-password")
async def reset_password(
    token: str,
    new_password: str,
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if email is None or token_type != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token"
        )
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    return {"message": "Password reset successfully"}

@router.post("/logout")
async def logout(
    response: Response,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    # Log activity
    await log_activity(db, current_user.id, "logout", request)
    
    # Clear the refresh token cookie
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, path="/", 
                           # domain=None, # Specify domain if needed for cross-subdomain cookies
                           # secure=True, # UNCOMMENT IN PRODUCTION
                           # httponly=True, # UNCOMMENT IN PRODUCTION
                           # samesite="lax" # UNCOMMENT IN PRODUCTION
                           samesite="lax" if not os.getenv("DEV_MODE") else "none",
                           secure=True if not os.getenv("DEV_MODE") else False,
                           httponly=True # always httponly for this cookie
                           )
    
    return {"message": "Successfully logged out"}