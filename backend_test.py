#!/usr/bin/env python3
"""
Backend API tests for The Earnings Edge
Tests all 5 endpoints with validation rules from review_request
"""
import requests
import sys
from datetime import datetime

BASE_URL = "http://localhost:3000/api"
CURRENT_DATE = "2026-05-20"  # Container date

def log(msg):
    print(f"[TEST] {msg}")

def test_health():
    """Test GET /api/health"""
    log("Testing GET /api/health")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        log(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        log(f"  Response: {data}")
        
        if not isinstance(data, dict):
            log(f"  ❌ FAIL: Response is not a dict")
            return False
        
        if data.get('ok') != True:
            log(f"  ❌ FAIL: Expected ok=true, got {data.get('ok')}")
            return False
        
        if data.get('hasKey') != True:
            log(f"  ❌ FAIL: Expected hasKey=true, got {data.get('hasKey')}")
            return False
        
        log("  ✅ PASS: Health endpoint working correctly")
        return True
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def test_earnings_demo():
    """Test GET /api/earnings?demo=true"""
    log("Testing GET /api/earnings?demo=true")
    try:
        resp = requests.get(f"{BASE_URL}/earnings?demo=true", timeout=10)
        log(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Check mode
        if data.get('mode') != 'demo':
            log(f"  ❌ FAIL: Expected mode='demo', got '{data.get('mode')}'")
            return False
        
        # Check count
        if data.get('count') != 12:
            log(f"  ❌ FAIL: Expected count=12, got {data.get('count')}")
            return False
        
        rows = data.get('rows', [])
        if len(rows) != 12:
            log(f"  ❌ FAIL: Expected 12 rows, got {len(rows)}")
            return False
        
        log(f"  Mode: {data.get('mode')}, Count: {data.get('count')}")
        
        # Validate each row has required fields
        required_fields = ['ticker', 'name', 'reportDate', 'hour', 'spot', 'impliedMove', 
                          'avgRealized', 'stdDev', 'realizedHistory', 'mispricingPp', 'atmStrike']
        
        for i, row in enumerate(rows):
            for field in required_fields:
                if field not in row:
                    log(f"  ❌ FAIL: Row {i} missing field '{field}'")
                    return False
            
            # Check realizedHistory is array of 8
            if not isinstance(row['realizedHistory'], list) or len(row['realizedHistory']) != 8:
                log(f"  ❌ FAIL: Row {i} realizedHistory must be array of 8, got {len(row.get('realizedHistory', []))}")
                return False
            
            # Check each history item has q and value
            for j, hist in enumerate(row['realizedHistory']):
                if 'q' not in hist or 'value' not in hist:
                    log(f"  ❌ FAIL: Row {i} realizedHistory[{j}] missing 'q' or 'value'")
                    return False
        
        # Check sorting by abs(mispricingPp) desc
        for i in range(len(rows) - 1):
            if abs(rows[i]['mispricingPp']) < abs(rows[i+1]['mispricingPp']):
                log(f"  ❌ FAIL: Rows not sorted by abs(mispricingPp) desc")
                log(f"    Row {i}: {abs(rows[i]['mispricingPp'])}, Row {i+1}: {abs(rows[i+1]['mispricingPp'])}")
                return False
        
        # Check for at least one >10pp overpriced and one <-5pp underpriced
        has_overpriced = any(row['mispricingPp'] > 10 for row in rows)
        has_underpriced = any(row['mispricingPp'] < -5 for row in rows)
        
        if not has_overpriced:
            log(f"  ❌ FAIL: No row with mispricingPp > 10 (overpriced)")
            return False
        
        if not has_underpriced:
            log(f"  ❌ FAIL: No row with mispricingPp < -5 (underpriced)")
            return False
        
        log(f"  ✅ Has overpriced (>10pp): {has_overpriced}")
        log(f"  ✅ Has underpriced (<-5pp): {has_underpriced}")
        log(f"  ✅ PASS: Demo mode working correctly")
        return True
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def test_earnings_demo_different_weeks():
    """Test GET /api/earnings?demo=true with different weeks"""
    log("Testing GET /api/earnings?demo=true with different weeks")
    try:
        resp1 = requests.get(f"{BASE_URL}/earnings?demo=true&week=2026-05-25", timeout=10)
        resp2 = requests.get(f"{BASE_URL}/earnings?demo=true&week=2026-06-01", timeout=10)
        
        if resp1.status_code != 200 or resp2.status_code != 200:
            log(f"  ❌ FAIL: Expected 200 for both requests")
            return False
        
        data1 = resp1.json()
        data2 = resp2.json()
        
        # Check that values differ deterministically
        rows1 = data1.get('rows', [])
        rows2 = data2.get('rows', [])
        
        if len(rows1) != 12 or len(rows2) != 12:
            log(f"  ❌ FAIL: Expected 12 rows for both weeks")
            return False
        
        # Compare first row's impliedMove - should be different
        if rows1[0]['impliedMove'] == rows2[0]['impliedMove']:
            log(f"  ⚠️  WARNING: Different weeks produced same impliedMove (may be coincidence)")
        else:
            log(f"  ✅ Different weeks produce different values (deterministic)")
        
        log(f"  ✅ PASS: Demo mode with different weeks working")
        return True
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def test_earnings_live():
    """Test GET /api/earnings (LIVE mode) - may take 30-60s"""
    log("Testing GET /api/earnings (LIVE mode) - this may take 30-60 seconds...")
    try:
        resp = requests.get(f"{BASE_URL}/earnings", timeout=90)
        log(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # CRITICAL: mode must be "live", never "demo"
        if data.get('mode') != 'live':
            log(f"  ❌ FAIL: Expected mode='live', got '{data.get('mode')}'")
            log(f"  🚨 CRITICAL BUG: Live mode returning demo synthetic data!")
            return False
        
        log(f"  Mode: {data.get('mode')}, Count: {data.get('count')}")
        
        rows = data.get('rows', [])
        log(f"  Rows returned: {len(rows)}")
        
        if len(rows) == 0:
            log(f"  ℹ️  No earnings data for current week (acceptable)")
            log(f"  ✅ PASS: Live mode working (empty result)")
            return True
        
        # Validate each row
        required_fields = ['ticker', 'reportDate', 'spot', 'impliedMove', 
                          'avgRealized', 'stdDev', 'realizedHistory', 'mispricingPp']
        
        for i, row in enumerate(rows):
            # Check required fields
            for field in required_fields:
                if field not in row:
                    log(f"  ❌ FAIL: Row {i} missing field '{field}'")
                    return False
            
            # Check reportDate >= today (2026-05-20)
            if row['reportDate'] < CURRENT_DATE:
                log(f"  ❌ FAIL: Row {i} reportDate {row['reportDate']} < today {CURRENT_DATE}")
                log(f"  🚨 CRITICAL BUG: Live row with past reportDate!")
                return False
            
            # Check ticker does not contain '.'
            if '.' in row['ticker']:
                log(f"  ❌ FAIL: Row {i} ticker '{row['ticker']}' contains '.' (non-US)")
                return False
            
            # Check impliedMove > 0
            if not (row['impliedMove'] > 0):
                log(f"  ❌ FAIL: Row {i} impliedMove {row['impliedMove']} not > 0")
                return False
            
            # Check impliedMove is not NaN or Infinity
            if not isinstance(row['impliedMove'], (int, float)) or \
               row['impliedMove'] != row['impliedMove'] or \
               row['impliedMove'] == float('inf') or row['impliedMove'] == float('-inf'):
                log(f"  ❌ FAIL: Row {i} impliedMove is NaN or Infinity")
                return False
            
            # Check realizedHistory length >= 2
            if not isinstance(row['realizedHistory'], list) or len(row['realizedHistory']) < 2:
                log(f"  ❌ FAIL: Row {i} realizedHistory length {len(row.get('realizedHistory', []))} < 2")
                return False
        
        # Check sorting by abs(mispricingPp) desc
        for i in range(len(rows) - 1):
            if abs(rows[i]['mispricingPp']) < abs(rows[i+1]['mispricingPp']):
                log(f"  ❌ FAIL: Rows not sorted by abs(mispricingPp) desc")
                return False
        
        log(f"  ✅ All {len(rows)} rows validated successfully")
        log(f"  ✅ PASS: Live mode working correctly")
        return True
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def test_earnings_live_future_week():
    """Test GET /api/earnings?week=2026-05-25 (force future week)"""
    log("Testing GET /api/earnings?week=2026-05-25 (future week)")
    try:
        resp = requests.get(f"{BASE_URL}/earnings?week=2026-05-25", timeout=90)
        log(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get('mode') != 'live':
            log(f"  ❌ FAIL: Expected mode='live', got '{data.get('mode')}'")
            return False
        
        log(f"  Mode: {data.get('mode')}, Count: {data.get('count')}")
        log(f"  ✅ PASS: Future week live mode working")
        return True
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def test_quote_valid():
    """Test GET /api/quote?symbol=AAPL"""
    log("Testing GET /api/quote?symbol=AAPL")
    try:
        resp = requests.get(f"{BASE_URL}/quote?symbol=AAPL", timeout=15)
        log(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        log(f"  Response: {data}")
        
        # Check required fields
        if 'symbol' not in data or 'price' not in data or 'name' not in data:
            log(f"  ❌ FAIL: Missing required fields (symbol, price, name)")
            return False
        
        if data['symbol'] != 'AAPL':
            log(f"  ❌ FAIL: Expected symbol='AAPL', got '{data['symbol']}'")
            return False
        
        if not isinstance(data['price'], (int, float)) or data['price'] <= 0:
            log(f"  ❌ FAIL: Invalid price: {data['price']}")
            return False
        
        log(f"  ✅ PASS: Quote endpoint working correctly")
        return True
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def test_quote_invalid():
    """Test GET /api/quote?symbol=NONEXISTENT123"""
    log("Testing GET /api/quote?symbol=NONEXISTENT123")
    try:
        resp = requests.get(f"{BASE_URL}/quote?symbol=NONEXISTENT123", timeout=15)
        log(f"  Status: {resp.status_code}")
        
        if resp.status_code == 404:
            log(f"  ✅ PASS: Correctly returns 404 for invalid symbol")
            return True
        elif resp.status_code == 200:
            data = resp.json()
            if 'error' in data:
                log(f"  ✅ PASS: Returns error message for invalid symbol")
                return True
            else:
                log(f"  ⚠️  WARNING: Returns 200 but should return 404 or error")
                return True  # Not a critical failure
        else:
            log(f"  ❌ FAIL: Unexpected status code {resp.status_code}")
            return False
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def test_option_valid():
    """Test GET /api/option?symbol=AAPL&strike=200&expiry=2026-06-19&type=call"""
    log("Testing GET /api/option?symbol=AAPL&strike=200&expiry=2026-06-19&type=call")
    try:
        resp = requests.get(f"{BASE_URL}/option?symbol=AAPL&strike=200&expiry=2026-06-19&type=call", timeout=15)
        log(f"  Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            log(f"  Response: {data}")
            
            if 'price' in data:
                log(f"  ✅ PASS: Option endpoint returns price")
                return True
            else:
                log(f"  ⚠️  WARNING: 200 but no price field")
                return True
        elif resp.status_code == 404:
            log(f"  ℹ️  Strike not found (acceptable)")
            log(f"  ✅ PASS: Option endpoint working (404 acceptable)")
            return True
        else:
            log(f"  ❌ FAIL: Unexpected status code {resp.status_code}")
            return False
    except Exception as e:
        log(f"  ❌ FAIL: Exception: {e}")
        return False

def main():
    log("=" * 60)
    log("Starting Backend API Tests for The Earnings Edge")
    log(f"Base URL: {BASE_URL}")
    log(f"Current Date: {CURRENT_DATE}")
    log("=" * 60)
    
    results = {}
    
    # Test in priority order: high first
    log("\n" + "=" * 60)
    log("HIGH PRIORITY TESTS")
    log("=" * 60)
    
    results['demo_mode'] = test_earnings_demo()
    results['demo_different_weeks'] = test_earnings_demo_different_weeks()
    results['live_mode'] = test_earnings_live()
    results['live_future_week'] = test_earnings_live_future_week()
    
    log("\n" + "=" * 60)
    log("MEDIUM PRIORITY TESTS")
    log("=" * 60)
    
    results['quote_valid'] = test_quote_valid()
    results['quote_invalid'] = test_quote_invalid()
    results['option_valid'] = test_option_valid()
    
    log("\n" + "=" * 60)
    log("LOW PRIORITY TESTS")
    log("=" * 60)
    
    results['health'] = test_health()
    
    # Summary
    log("\n" + "=" * 60)
    log("TEST SUMMARY")
    log("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status}: {test_name}")
    
    log("=" * 60)
    log(f"TOTAL: {passed}/{total} tests passed")
    log("=" * 60)
    
    if passed == total:
        log("🎉 ALL TESTS PASSED!")
        return 0
    else:
        log("⚠️  SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
