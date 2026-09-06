import { slidingWindow } from '@arcjet/node';
import aj from '../config/arcjet.js';

const securityMiddleware = async (req, res, next) => {
  try {
    const role = req.user?.role || 'guest';

    let limit;
    let message;

    switch (role) {
      case 'admin':
        limit = 20;
        message = 'Admin request limit is exceeded, please slow down';
        break;
      case 'user':
        limit = 10;
        message = 'user request limit is exceeded, please slow down';
        break;
      case 'guest':
        limit = 5;
        message = 'guest request limit is exceeded, please slow down';
        break;
    }

    const client = aj.withRule(
      slidingWindow({
        mode: 'LIVE',
        interval: '1m',
        max: limit,
        name: `${role} rate limit`,
      })
    );

    const decision = await client.protect(req);

    if (decision.isDenied() && decision.reason.isBot()) {
      console.warn('Bot request blocked', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Automated request is not allowed',
      });
    }

    if (decision.isDenied() && decision.reason.isShield()) {
      console.warn('Shield request blocked', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Request blocked by security policy',
      });
    }

    if (decision.isDenied() && decision.reason.isRateLimit()) {
      console.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Too many requests',
      });
    }

    next();
  } catch (error) {
    console.error('arcjet middleware error', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'something went wrong with security middleware',
    });
  }
};

export default securityMiddleware;
