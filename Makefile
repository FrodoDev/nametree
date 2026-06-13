.PHONY: install dev debug frontend-dev check check-frontend check-tauri build build-frontend build-tauri clean

install:
	npm install

dev:
	npm run tauri dev

debug:
	npm run root:check

frontend-dev:
	npm run dev

check: check-frontend check-tauri

check-frontend:
	npm run build

check-tauri:
	cd src-tauri && cargo check

build: build-tauri

build-frontend:
	npm run build

build-tauri:
	npm run tauri build

clean:
	rm -rf dist
	cd src-tauri && cargo clean
