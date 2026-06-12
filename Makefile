.PHONY: install dev migrate seed build

# Install all dependencies
install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

# Run backend + frontend concurrently (requires concurrently or two terminals)
dev:
	@echo "Starting backend on :8000 and frontend on :5173"
	cd backend && uvicorn app.main:app --reload --port 8000 &
	cd frontend && npm run dev

# Run Alembic migrations
migrate:
	cd backend && alembic upgrade head

# Seed the database
seed:
	cd backend && python seed.py

# Build frontend for production
build:
	cd frontend && npm run build

# Generate a new Alembic migration
migration:
	cd backend && alembic revision --autogenerate -m "$(name)"

# Check backend imports
check:
	cd backend && python -c "from app.main import app; print('Backend OK')"
