set shell := ["bash", "-euo", "pipefail", "-c"]

port := "8765"
image := "text-to-link-dev"
# builds, tests and image rendering run in the container; files stay owned by the current user
run := "docker run --rm --init --user $(id -u):$(id -g) -v $PWD:/app " + image

# list recipes
default:
    @just --list

# build the Docker image with Python, Chromium and pngquant
image:
    docker build -t {{image}} .

# generate pages, sitemap, robots.txt and sw.js from src/
build: image
    {{run}} python3 build.py

# render favicon, touch icons and og-image.png
assets: image
    {{run}} python3 tools/make_assets.py

# build and serve the site locally (see the port variable)
serve: build
    @echo "http://localhost:{{port}}/"
    docker run --rm --init -p {{port}}:{{port}} -v $PWD:/app {{image}} python3 -m http.server {{port}}

# rebuild and restart the server on changes in src/ and assets/ (needs entr)
watch:
    find src assets build.py -type f | entr -r just serve

# unit tests of assets/core.js
test-core: image
    {{run}} tools/test.sh core

# end-to-end tests in headless Chrome (on the freshly built pages)
test-e2e: build
    {{run}} tools/test.sh e2e

# all tests
test: test-core test-e2e

# what CI runs: tests, then fail if the committed pages differ from a fresh build
ci: test
    test -z "$(git status --porcelain -- . ':!.idea')" || { git status --short; echo "generated files are out of date: run 'just build' and commit"; exit 1; }
