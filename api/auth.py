from datetime import datetime, timedelta
import random
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from passlib.context import CryptContext
from jose import JWTError, jwt
import redis

from database import get_db
from models import User
from schemas import UserCreate, UserResponse, VerifyOTP, Token
import os

# Configuration
SECRET_KEY = os.environ.get("SECRET_KEY", "super-secret-key-for-dev")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week
OTP_EXPIRE_SECONDS = 300 # 5 minutes

# Setup tools
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter(prefix="/api/auth", tags=["auth"])
redis_client = redis.Redis(host='redis', port=6379, db=1, decode_responses=True)

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

import smtplib
from email.mime.text import MIMEText

def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))

def send_otp_email(to_email: str, otp: str):
    smtp_server = os.environ.get("SMTP_SERVER")
    smtp_port = os.environ.get("SMTP_PORT")
    smtp_user = os.environ.get("SMTP_USERNAME")
    smtp_pass = os.environ.get("SMTP_PASSWORD")

    if not all([smtp_server, smtp_port, smtp_user, smtp_pass]):
        print("SMTP credentials not fully configured. Falling back to console.")
        print("=" * 40)
        print(f" OTP FOR {to_email}: {otp} ")
        print("=" * 40)
        return

    try:
        msg = MIMEText(f"Your CodeArena verification code is: {otp}\nThis code expires in {OTP_EXPIRE_SECONDS//60} minutes.")
        msg["Subject"] = "CodeArena: Verify Your Email"
        msg["From"] = smtp_user
        msg["To"] = to_email

        # Connect and send
        server = smtplib.SMTP_SSL(smtp_server, int(smtp_port)) if int(smtp_port) == 465 else smtplib.SMTP(smtp_server, int(smtp_port))
        if int(smtp_port) != 465:
            server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"Email successfully sent to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
        print("=" * 40)
        print(f" OTP FOR {to_email}: {otp} ")
        print("=" * 40)

@router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if username or email exists
    result = await db.execute(select(User).where((User.username == user.username) | (User.email == user.email)))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already registered")

    # Create user as unverified
    new_user = User(
        id=str(uuid.uuid4()),
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
        is_verified=False
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Generate and store OTP in Redis
    otp = generate_otp()
    redis_client.setex(f"otp:{user.email}", OTP_EXPIRE_SECONDS, otp)
    
    # Send email (or fallback to console if SMTP not configured)
    send_otp_email(user.email, otp)

    return new_user

@router.post("/verify-otp")
async def verify_otp(payload: VerifyOTP, db: AsyncSession = Depends(get_db)):
    # Check Redis for the OTP
    stored_otp = redis_client.get(f"otp:{payload.email}")
    if not stored_otp or stored_otp != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Mark user as verified
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_verified = True
    await db.commit()

    # Clear OTP from Redis
    redis_client.delete(f"otp:{payload.email}")

    return {"message": "Email successfully verified!"}

@router.post("/login", response_model=Token)
async def login(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    # We use UserCreate schema here just to easily get email and password
    result = await db.execute(select(User).where(User.email == user_data.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email is not verified. Please verify your OTP.")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "id": user.id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

from schemas import ChangePassword

@router.post("/change-password")
async def change_password(payload: ChangePassword, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    
    current_user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    
    return {"message": "Password updated successfully"}
