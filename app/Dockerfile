# Use an official Python image (AWS Lambda base is similar)
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Prevents Python from writing .pyc files and enables stdout logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install dependencies system-wide (for Django)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements first (for layer caching)
COPY requirements.txt /app/

RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy rest of the project
COPY . /app/

# Expose the app port
EXPOSE 8000

RUN useradd appuser && chown -R appuser /app
USER appuser

# Default command (use start.sh for ECS)
RUN chmod +x /app/start.sh
CMD ["./start.sh"]