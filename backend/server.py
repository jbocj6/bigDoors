from fastapi import FastAPI, APIRouter, HTTPException, Depends, File, UploadFile, Form, Body, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from geopy.distance import geodesic
import os
import logging
import uuid
import base64
from pathlib import Path
import io
from PIL import Image

# Environment setup
ROOT_DIR = Path(__file__).parent
from dotenv import load_dotenv
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'door_discovery_db')]

# Create the main app without a prefix
app = FastAPI(title="Door Discovery API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# JWT Configuration
SECRET_KEY = os.environ.get("SECRET_KEY", "thisisasecretkey12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 bearer token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define Models
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserInDB(User):
    hashed_password: str

class Location(BaseModel):
    latitude: float
    longitude: float

class DoorBase(BaseModel):
    title: str
    description: str
    place_name: Optional[str] = None
    history: Optional[str] = None
    category: str  # "A" or "B"
    location: Location

class DoorCreate(DoorBase):
    pass

class Door(DoorBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    image_url: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CommentBase(BaseModel):
    text: str

class CommentCreate(CommentBase):
    door_id: str

class Comment(CommentBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    door_id: str
    user_id: str
    user_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class NotificationBase(BaseModel):
    title: str
    message: str
    door_id: str

class Notification(NotificationBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

async def get_user_by_email(email: str):
    user = await db.users.find_one({"email": email})
    if user:
        return UserInDB(**user)
    return None

async def authenticate_user(email: str, password: str):
    user = await get_user_by_email(email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = await get_user_by_email(email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

# Auth routes
@api_router.post("/register", response_model=User)
async def register_user(user: UserCreate):
    db_user = await get_user_by_email(user.email)
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    hashed_password = get_password_hash(user.password)
    user_dict = user.dict(exclude={"password"})
    user_dict["id"] = str(uuid.uuid4())
    user_in_db = UserInDB(
        **user_dict,
        hashed_password=hashed_password
    )
    
    await db.users.insert_one(user_in_db.dict())
    
    return User(**user_in_db.dict(exclude={"hashed_password"}))

@api_router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@api_router.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# Door routes
@api_router.post("/doors", response_model=Door)
async def create_door(
    title: str = Form(...),
    description: str = Form(...),
    place_name: str = Form(None),
    history: str = Form(None),
    category: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    # Validate category
    if category not in ["A", "B"]:
        raise HTTPException(status_code=400, detail="Category must be either 'A' or 'B'")
    
    # Save image as base64
    image_content = await image.read()
    try:
        img = Image.open(io.BytesIO(image_content))
        img = img.resize((800, int(800 * img.height / img.width)))
        output = io.BytesIO()
        img.save(output, format="JPEG")
        image_base64 = base64.b64encode(output.getvalue()).decode("utf-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")
    
    # Create door
    door = Door(
        title=title,
        description=description,
        place_name=place_name,
        history=history,
        category=category,
        location=Location(latitude=latitude, longitude=longitude),
        user_id=current_user.id,
        user_name=current_user.name,
        image_url=f"data:image/jpeg;base64,{image_base64}"
    )
    
    await db.doors.insert_one(door.dict())
    
    # Create notifications for users within 25 miles
    await create_notifications_for_nearby_users(door)
    
    return door

async def create_notifications_for_nearby_users(door: Door):
    door_location = (door.location.latitude, door.location.longitude)
    
    # Get all users
    users = await db.users.find().to_list(1000)
    
    for user in users:
        # Skip the door creator
        if user["id"] == door.user_id:
            continue
        
        # Create notification for all users (in a real app, you'd check for user location)
        notification = Notification(
            title=f"New {door.category} Door Discovered!",
            message=f"{door.user_name} discovered a door: {door.title}",
            door_id=door.id,
            user_id=user["id"]
        )
        
        await db.notifications.insert_one(notification.dict())

@api_router.get("/doors", response_model=List[Door])
async def get_doors(
    category: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    query = {}
    if category:
        query["category"] = category
    
    doors = await db.doors.find(query).to_list(1000)
    return [Door(**door) for door in doors]

@api_router.get("/doors/{door_id}", response_model=Door)
async def get_door(door_id: str, current_user: User = Depends(get_current_user)):
    door = await db.doors.find_one({"id": door_id})
    if not door:
        raise HTTPException(status_code=404, detail="Door not found")
    return Door(**door)

# Comment routes
@api_router.post("/comments", response_model=Comment)
async def create_comment(
    comment: CommentCreate,
    current_user: User = Depends(get_current_user)
):
    # Check if door exists
    door = await db.doors.find_one({"id": comment.door_id})
    if not door:
        raise HTTPException(status_code=404, detail="Door not found")
    
    new_comment = Comment(
        **comment.dict(),
        user_id=current_user.id,
        user_name=current_user.name
    )
    
    await db.comments.insert_one(new_comment.dict())
    
    return new_comment

@api_router.get("/comments/{door_id}", response_model=List[Comment])
async def get_comments(
    door_id: str,
    current_user: User = Depends(get_current_user)
):
    comments = await db.comments.find({"door_id": door_id}).to_list(1000)
    return [Comment(**comment) for comment in comments]

# Notification routes
@api_router.get("/notifications", response_model=List[Notification])
async def get_notifications(current_user: User = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": current_user.id}
    ).sort("created_at", -1).to_list(100)
    
    return [Notification(**notification) for notification in notifications]

@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user.id},
        {"$set": {"is_read": True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"success": True}

# Root API endpoint
@api_router.get("/")
async def root():
    return {"message": "Door Discovery API"}

# Include the router in the main app
app.include_router(api_router)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
