import requests
import sys
import time
import random
import string
import base64
from datetime import datetime
from PIL import Image
import io
import os

class DoorDiscoveryAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_email = f"test_user_{int(time.time())}@example.com"
        self.user_password = "TestPassword123!"
        self.user_name = f"Test User {int(time.time())}"
        self.test_door_id = None
        self.test_notification_id = None
        self.test_comment_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, form_data=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    # Remove Content-Type header for multipart/form-data
                    if 'Content-Type' in headers:
                        del headers['Content-Type']
                    response = requests.post(url, headers=headers, files=files, data=form_data)
                else:
                    response = requests.post(url, json=data, headers=headers)
            
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json().get('detail', 'No detail provided')
                    print(f"Error: {error_detail}")
                except:
                    print(f"Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_register(self):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "register",
            200,
            data={
                "name": self.user_name,
                "email": self.user_email,
                "password": self.user_password
            }
        )
        return success

    def test_login(self):
        """Test login and get token"""
        # For login, we need to use form data
        form_data = {
            "username": self.user_email,
            "password": self.user_password
        }
        
        success, response = self.run_test(
            "User Login",
            "POST",
            "token",
            200,
            data=form_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user profile"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "users/me",
            200
        )
        return success

    def test_create_door(self):
        """Test creating a new door"""
        # Create a simple test image
        img = Image.new('RGB', (100, 100), color='red')
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='JPEG')
        img_byte_arr.seek(0)
        
        # Prepare form data and files
        files = {
            'image': ('test_door.jpg', img_byte_arr, 'image/jpeg')
        }
        
        form_data = {
            'title': f'Test Door {int(time.time())}',
            'description': 'This is a test door created by automated testing',
            'place_name': 'Test Location',
            'history': 'This door has a rich testing history',
            'category': 'A',
            'latitude': 40.7128,
            'longitude': -74.0060
        }
        
        success, response = self.run_test(
            "Create Door",
            "POST",
            "doors",
            200,
            files=files,
            form_data=form_data
        )
        
        if success and 'id' in response:
            self.test_door_id = response['id']
            return True
        return False

    def test_get_doors(self):
        """Test getting all doors"""
        success, response = self.run_test(
            "Get All Doors",
            "GET",
            "doors",
            200
        )
        return success

    def test_get_doors_by_category(self):
        """Test getting doors by category"""
        success, response = self.run_test(
            "Get Doors by Category",
            "GET",
            "doors?category=A",
            200
        )
        return success

    def test_get_door_by_id(self):
        """Test getting a specific door by ID"""
        if not self.test_door_id:
            print("❌ Cannot test get_door_by_id: No door ID available")
            return False
        
        success, response = self.run_test(
            "Get Door by ID",
            "GET",
            f"doors/{self.test_door_id}",
            200
        )
        return success

    def test_add_comment(self):
        """Test adding a comment to a door"""
        if not self.test_door_id:
            print("❌ Cannot test add_comment: No door ID available")
            return False
        
        success, response = self.run_test(
            "Add Comment",
            "POST",
            "comments",
            200,
            data={
                "text": f"Test comment {int(time.time())}",
                "door_id": self.test_door_id
            }
        )
        
        if success and 'id' in response:
            self.test_comment_id = response['id']
            return True
        return False

    def test_get_comments(self):
        """Test getting comments for a door"""
        if not self.test_door_id:
            print("❌ Cannot test get_comments: No door ID available")
            return False
        
        success, response = self.run_test(
            "Get Comments",
            "GET",
            f"comments/{self.test_door_id}",
            200
        )
        return success

    def test_get_notifications(self):
        """Test getting notifications"""
        success, response = self.run_test(
            "Get Notifications",
            "GET",
            "notifications",
            200
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            self.test_notification_id = response[0]['id']
            return True
        return success

    def test_mark_notification_as_read(self):
        """Test marking a notification as read"""
        if not self.test_notification_id:
            print("❌ Cannot test mark_notification_as_read: No notification ID available")
            return False
        
        success, response = self.run_test(
            "Mark Notification as Read",
            "POST",
            f"notifications/{self.test_notification_id}/read",
            200,
            data={}
        )
        return success

    def run_all_tests(self):
        """Run all API tests in sequence"""
        print("🚀 Starting Door Discovery API Tests")
        
        # Auth tests
        if not self.test_register():
            print("❌ Registration failed, stopping tests")
            return False
        
        if not self.test_login():
            print("❌ Login failed, stopping tests")
            return False
        
        if not self.test_get_current_user():
            print("❌ Get current user failed")
        
        # Door tests
        if not self.test_create_door():
            print("❌ Create door failed")
        
        if not self.test_get_doors():
            print("❌ Get doors failed")
        
        if not self.test_get_doors_by_category():
            print("❌ Get doors by category failed")
        
        if not self.test_get_door_by_id():
            print("❌ Get door by ID failed")
        
        # Comment tests
        if not self.test_add_comment():
            print("❌ Add comment failed")
        
        if not self.test_get_comments():
            print("❌ Get comments failed")
        
        # Notification tests
        if not self.test_get_notifications():
            print("❌ Get notifications failed")
        
        if self.test_notification_id and not self.test_mark_notification_as_read():
            print("❌ Mark notification as read failed")
        
        # Print results
        print(f"\n📊 Tests passed: {self.tests_passed}/{self.tests_run}")
        return self.tests_passed == self.tests_run

def main():
    # Get backend URL from environment or use default
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://a1b906f2-7987-4330-8ae9-7ba3637b580a.preview.emergentagent.com')
    
    # Run tests
    tester = DoorDiscoveryAPITester(backend_url)
    success = tester.run_all_tests()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())