const { describe, test, expect, beforeEach } = require('@jest/globals');

const { withCORS, ALLOWED_ORIGINS } = require('../../../lib/cors');

describe('CORS Utilities', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      headers: {
        origin: 'http://localhost:3000'
      }
    };
    mockRes = {
      setHeader: jest.fn().mockReturnThis()
    };
  });

  test('allows requests from allowed origins', () => {
    mockReq.headers.origin = 'http://localhost:3000';
    
    withCORS(mockReq, mockRes);
    
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, OPTIONS');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
  });

  test('allows requests from production origin', () => {
    mockReq.headers.origin = 'https://reddit-dashboarder.vercel.app';
    
    withCORS(mockReq, mockRes);
    
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://reddit-dashboarder.vercel.app');
  });

  test('handles requests without origin header', () => {
    delete mockReq.headers.origin;
    
    withCORS(mockReq, mockRes);
    
    // Should use first allowed origin as default
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  });

  test('rejects requests from disallowed origins', () => {
    mockReq.headers.origin = 'https://evil.com';
    
    withCORS(mockReq, mockRes);
    
    // Should not set Access-Control-Allow-Origin for disallowed origins
    const calls = mockRes.setHeader.mock.calls;
    const originCall = calls.find(call => call[0] === 'Access-Control-Allow-Origin');
    expect(originCall).toBeUndefined();
  });

  test('supports custom methods', () => {
    mockReq.headers.origin = 'http://localhost:3000';
    
    withCORS(mockReq, mockRes, 'GET, POST, DELETE');
    
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  });
});
