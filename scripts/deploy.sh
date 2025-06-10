#!/bin/bash

# PromptHub MCP Server Deployment Script
# This script handles the deployment of the PromptHub MCP server

set -e

# Configuration
PROJECT_NAME="prompthub-mcp"
DOCKER_IMAGE="prompthub/mcp-server"
DOCKER_TAG="${DOCKER_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"
CONFIG_FILE="config/${ENVIRONMENT}.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    log_success "All prerequisites are met."
}

# Validate environment variables
validate_env() {
    log_info "Validating environment variables..."
    
    required_vars=(
        "OPENAI_API_KEY"
        "ANTHROPIC_API_KEY"
        "SOLANA_RPC_URL"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
    )
    
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        log_error "Please set these variables before deploying."
        exit 1
    fi
    
    log_success "Environment variables validated."
}

# Build the application
build_app() {
    log_info "Building the application..."
    
    # Install dependencies
    npm ci --production
    
    # Build TypeScript
    npm run build
    
    # Run tests
    if [[ "$SKIP_TESTS" != "true" ]]; then
        log_info "Running tests..."
        npm test
    fi
    
    log_success "Application built successfully."
}

# Build Docker image
build_docker() {
    log_info "Building Docker image..."
    
    docker build -t "${DOCKER_IMAGE}:${DOCKER_TAG}" .
    
    # Tag as latest if not already
    if [[ "$DOCKER_TAG" != "latest" ]]; then
        docker tag "${DOCKER_IMAGE}:${DOCKER_TAG}" "${DOCKER_IMAGE}:latest"
    fi
    
    log_success "Docker image built successfully."
}

# Deploy with Docker Compose
deploy_compose() {
    log_info "Deploying with Docker Compose..."
    
    # Create docker-compose.yml if it doesn't exist
    if [[ ! -f "docker-compose.yml" ]]; then
        create_docker_compose
    fi
    
    # Stop existing containers
    docker-compose down
    
    # Start new containers
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Health check
    if health_check; then
        log_success "Deployment completed successfully."
    else
        log_error "Deployment failed health check."
        exit 1
    fi
}

# Create docker-compose.yml
create_docker_compose() {
    log_info "Creating docker-compose.yml..."
    
    cat > docker-compose.yml << EOF
version: '3.8'

services:
  prompthub-mcp:
    image: ${DOCKER_IMAGE}:${DOCKER_TAG}
    container_name: prompthub-mcp-server
    ports:
      - "3000:3000"
      - "9090:9090"
    environment:
      - NODE_ENV=${ENVIRONMENT}
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY}
      - SOLANA_RPC_URL=\${SOLANA_RPC_URL}
      - JWT_SECRET=\${JWT_SECRET}
      - ENCRYPTION_KEY=\${ENCRYPTION_KEY}
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./config:/app/config:ro
      - ./logs:/var/log/prompthub-mcp
    depends_on:
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: prompthub-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  prometheus:
    image: prom/prometheus:latest
    container_name: prompthub-prometheus
    ports:
      - "9091:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    restart: unless-stopped

volumes:
  redis_data:
  prometheus_data:
EOF
    
    log_success "docker-compose.yml created."
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s http://localhost:3000/health > /dev/null 2>&1; then
            log_success "Health check passed."
            return 0
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed. Retrying in 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts."
    return 1
}

# Rollback deployment
rollback() {
    log_warning "Rolling back deployment..."
    
    # Stop current containers
    docker-compose down
    
    # Start with previous image
    if [[ -n "$PREVIOUS_TAG" ]]; then
        DOCKER_TAG="$PREVIOUS_TAG"
        docker-compose up -d
        log_success "Rollback completed."
    else
        log_error "No previous version to rollback to."
        exit 1
    fi
}

# Cleanup old images
cleanup() {
    log_info "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old versions (keep last 3)
    docker images "${DOCKER_IMAGE}" --format "table {{.Tag}}\t{{.ID}}" | \
    tail -n +2 | \
    sort -V | \
    head -n -3 | \
    awk '{print $2}' | \
    xargs -r docker rmi
    
    log_success "Cleanup completed."
}

# Show logs
show_logs() {
    docker-compose logs -f prompthub-mcp
}

# Show status
show_status() {
    log_info "Service Status:"
    docker-compose ps
    
    log_info "Resource Usage:"
    docker stats --no-stream prompthub-mcp-server
}

# Main deployment function
deploy() {
    log_info "Starting deployment of PromptHub MCP Server..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Docker Tag: $DOCKER_TAG"
    
    check_prerequisites
    validate_env
    build_app
    build_docker
    deploy_compose
    
    log_success "Deployment completed successfully!"
    log_info "Server is running at http://localhost:3000"
    log_info "Metrics available at http://localhost:9090"
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "rollback")
        rollback
        ;;
    "cleanup")
        cleanup
        ;;
    "logs")
        show_logs
        ;;
    "status")
        show_status
        ;;
    "health")
        health_check
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|cleanup|logs|status|health}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the application (default)"
        echo "  rollback - Rollback to previous version"
        echo "  cleanup  - Clean up old Docker images"
        echo "  logs     - Show application logs"
        echo "  status   - Show service status"
        echo "  health   - Perform health check"
        exit 1
        ;;
esac 