# Makefile for building and pushing a Docker image to ECR

# Replace these with your actual values
AWS_REGION := me-south-1
ECR_REPOSITORY ?= 4es_backend
IMAGE_TAG ?= staging
DOCKERFILE_PATH := ./Dockerfile
BUILD_CONTEXT := .
AWS_PROFILE := 4es
SERVER_IP ?= 157.241.63.108
DIRECTORY_PATH ?= /4es/4es_backend
export AWS_PROFILE
# Get AWS account ID
AWS_ACCOUNT_ID := $(shell aws sts get-caller-identity --query Account --output text)

# ECR image URI
ECR_IMAGE_URI := $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/$(ECR_REPOSITORY):$(IMAGE_TAG)

# Build the Docker image
build: 
	docker build -t $(ECR_REPOSITORY):$(IMAGE_TAG) -f $(DOCKERFILE_PATH) $(BUILD_CONTEXT) --platform linux/amd64

# Tag the Docker image for ECR
tag:
	docker tag $(ECR_REPOSITORY):$(IMAGE_TAG) $(ECR_IMAGE_URI)

# Authenticate Docker with ECR
login:
	AWS_PROFILE=$(AWS_PROFILE) aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

# Push the Docker image to ECR
push:
	AWS_PROFILE=$(AWS_PROFILE) docker push "$(ECR_IMAGE_URI)"

remote-deploy:
	ssh $(SERVER_IP) "cd $(DIRECTORY_PATH) && make deploy"

# Clean up local images
clean:
	docker rmi $(ECR_REPOSITORY):$(IMAGE_TAG) $(ECR_IMAGE_URI) || true

deploy: build tag login push remote-deploy
.PHONY: deploy