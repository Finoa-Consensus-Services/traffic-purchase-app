# Build and run the production app.
#   make build   install dependencies and create the Next.js build
#   make run     build, then start the server (PORT defaults to 3000)

PORT ?= 3000

.PHONY: build run gitleaks

build:
	npm install --legacy-peer-deps
	npm run build

run: build
	PORT=$(PORT) npm start

gitleaks:
	gitleaks detect --source . --redact --config .gitleaks.toml
