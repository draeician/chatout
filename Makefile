.PHONY: test-browser test-unit

# One command: unit checks plus headless extension tests. Prints pass/fail.
test-browser:
	npm install
	npx playwright install chromium
	npm test
	npm run test:e2e

test-unit:
	node --test tests/unit/*.test.mjs
