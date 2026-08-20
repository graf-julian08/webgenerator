.PHONY: install redis celery backend frontend dev clean

# ── Install all dependencies ──────────────────────────────────
install:
	cd backend && pip install -r requirements.txt
	cd backend && python -m playwright install chromium
	cd frontend && npm install

# ── Start Redis (Docker) ─────────────────────────────────────
redis:
	docker compose up -d redis

# ── Start Celery Worker ──────────────────────────────────────
celery:
	cd backend && OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES celery -A tasks worker --loglevel=info --concurrency=3

# ── Start FastAPI Backend ────────────────────────────────────
backend:
	cd backend && python main.py

# ── Start Next.js Frontend ───────────────────────────────────
frontend:
	cd frontend && npm run dev

# ── Start Everything ─────────────────────────────────────────
dev:
	@echo "Starting Agentic Commerce OS..."
	@echo "1. Start Redis:   make redis"
	@echo "2. Start Celery:  make celery"
	@echo "3. Start Backend: make backend"
	@echo "4. Start Frontend: make frontend"
	@echo ""
	@echo "Or run each in a separate terminal."

# ── Clean outputs ────────────────────────────────────────────
clean:
	rm -rf backend/outputs/job_*
