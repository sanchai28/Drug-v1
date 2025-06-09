# app.py
from flask import Flask, render_template
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app) 
API_BASE_URL_FOR_CLIENT = os.getenv('API_BASE_URL_FOR_CLIENT', '/api')

# --- HTML Template Rendering Routes ---
@app.route('/')
@app.route('/index')
def index():
    return render_template('index.html', API_BASE_URL_FROM_SERVER=API_BASE_URL_FOR_CLIENT)

@app.route('/login')
def login_page():
    return render_template('login.html', API_BASE_URL_FROM_SERVER=API_BASE_URL_FOR_CLIENT)

# --- Register Blueprints ---
from blueprints.auth import auth_bp
from blueprints.unitservices import unitservices_bp
from blueprints.users import users_bp
from blueprints.medicines import medicines_bp
from blueprints.inventory import inventory_bp
from blueprints.dispense import dispense_bp
from blueprints.goods_received import gr_bp
from blueprints.requisitions import requisitions_bp
from blueprints.dashboard import dashboard_bp

app.register_blueprint(auth_bp)
app.register_blueprint(unitservices_bp)
app.register_blueprint(users_bp)
app.register_blueprint(medicines_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(dispense_bp)
app.register_blueprint(gr_bp)
app.register_blueprint(requisitions_bp)
app.register_blueprint(dashboard_bp)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8123, debug=True)