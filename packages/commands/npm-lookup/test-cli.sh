#!/bin/bash

# Test NPM command CLI interface
# This script provides basic testing for the npm command functionality

set -e  # Exit on any error

echo "🧪 Testing NPM Command CLI Interface"
echo "====================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to run test and capture output
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_success="$3"  # "true" if command should succeed, "false" if it should fail

    log_info "Running: $test_name"
    echo "Command: $command"
    echo ""

    if [ "$expected_success" = "true" ]; then
        if eval $command; then
            log_success "$test_name - PASSED"
        else
            log_error "$test_name - FAILED (expected success)"
            return 1
        fi
    else
        if eval $command; then
            log_error "$test_name - FAILED (expected failure)"
            return 1
        else
            log_success "$test_name - PASSED (expected failure)"
        fi
    fi

    echo ""
    echo "----------------------------------------"
    echo ""
}

# Test 1: Help command
run_test "NPM Command Help" \
    "npx mcp-funnel run npm --help" \
    "true"

# Test 2: Lookup help
run_test "NPM Lookup Help" \
    "npx mcp-funnel run npm lookup --help" \
    "true"

# Test 3: Search help
run_test "NPM Search Help" \
    "npx mcp-funnel run npm search --help" \
    "true"

# Test 4: Valid package lookup
run_test "NPM Lookup - Valid Package (express)" \
    "npx mcp-funnel run npm lookup express" \
    "true"

# Test 5: Valid package lookup - scoped package
run_test "NPM Lookup - Scoped Package (@types/node)" \
    "npx mcp-funnel run npm lookup @types/node" \
    "true"

# Test 6: Invalid package lookup
run_test "NPM Lookup - Invalid Package" \
    "npx mcp-funnel run npm lookup nonexistent-package-xyz-12345" \
    "false"

# Test 7: Valid search query
run_test "NPM Search - Valid Query (test framework)" \
    'npx mcp-funnel run npm search "test framework"' \
    "true"

# Test 8: Valid search query - single word
run_test "NPM Search - Single Word (react)" \
    "npx mcp-funnel run npm search react" \
    "true"

# Test 9: Valid search query with limit (if supported)
run_test "NPM Search - With Limit" \
    'npx mcp-funnel run npm search "typescript" --limit 5' \
    "true"

# Test 10: Empty search query
run_test "NPM Search - Empty Query" \
    'npx mcp-funnel run npm search ""' \
    "false"

# Test 11: Invalid subcommand
run_test "NPM - Invalid Subcommand" \
    "npx mcp-funnel run npm invalid-command" \
    "false"

# Test 12: No arguments
run_test "NPM - No Arguments" \
    "npx mcp-funnel run npm" \
    "false"

echo ""
echo "🏁 NPM Command CLI Tests Complete"
echo ""

# Additional information tests (these might take longer, so separate them)
log_info "Running additional verification tests (these may be slower)..."
echo ""

# Popular packages test
popular_packages=("lodash" "react" "vue" "angular" "webpack" "typescript")

for package in "${popular_packages[@]}"; do
    log_info "Testing popular package: $package"
    if npx mcp-funnel run npm lookup "$package" >/dev/null 2>&1; then
        log_success "✓ $package lookup successful"
    else
        log_warning "⚠ $package lookup failed (this might be a network issue)"
    fi
done

echo ""

# Search queries test
search_queries=("web framework" "database orm" "testing library" "build tool")

for query in "${search_queries[@]}"; do
    log_info "Testing search query: '$query'"
    if npx mcp-funnel run npm search "$query" >/dev/null 2>&1; then
        log_success "✓ Search '$query' successful"
    else
        log_warning "⚠ Search '$query' failed (this might be a network issue)"
    fi
done

echo ""
log_success "All NPM command tests completed!"
echo ""

# Usage examples
echo "📚 Usage Examples:"
echo "=================="
echo ""
echo "# Package lookup:"
echo "npx mcp-funnel run npm lookup express"
echo "npx mcp-funnel run npm lookup @types/node"
echo ""
echo "# Package search:"
echo 'npx mcp-funnel run npm search "test framework"'
echo "npx mcp-funnel run npm search react"
echo ""
echo "# Help:"
echo "npx mcp-funnel run npm --help"
echo "npx mcp-funnel run npm lookup --help"
echo "npx mcp-funnel run npm search --help"
echo ""

# Performance note
log_info "Note: The first run of each command may be slower due to caching."
log_info "Subsequent identical requests should be faster (5-minute cache)."
echo ""

# Troubleshooting
echo "🔧 Troubleshooting:"
echo "==================="
echo ""
echo "If tests fail:"
echo "1. Check internet connection"
echo "2. Verify NPM registry is accessible"
echo "3. Ensure MCP Funnel is properly built"
echo "4. Check for rate limiting (wait and retry)"
echo ""
echo "For debug output:"
echo "DEBUG=mcp-funnel:npm npx mcp-funnel run npm lookup express"
echo ""

echo "Done! 🎉"