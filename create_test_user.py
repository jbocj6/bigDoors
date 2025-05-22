import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import uuid
from datetime import datetime
from dotenv import load_dotenv

# Environment setup
load_dotenv('/app/backend/.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'door_discovery_db')]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

async def create_test_user():
    # Check if the user already exists
    existing_user = await db.users.find_one({"email": "test@example.com"})
    if existing_user:
        print("Test user already exists!")
        return
    
    # Create a new test user
    user = {
        "id": str(uuid.uuid4()),
        "email": "test@example.com",
        "name": "Test User",
        "hashed_password": get_password_hash("password123"),
        "created_at": datetime.utcnow()
    }
    
    # Insert into database
    await db.users.insert_one(user)
    print("Test user created successfully!")
    print("Email: test@example.com")
    print("Password: password123")

# Run the async function
asyncio.run(create_test_user())
