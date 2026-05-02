import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { UserRepository } from '../repositories/UserRepository';
import { AuditRepository } from '../repositories/AuditRepository';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { randomUUID } from 'crypto';

const router = express.Router();
const userRepo = new UserRepository();
const auditRepo = new AuditRepository();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later'
  }
});

// POST /api/auth/register - Register new user
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      first_name,
      last_name,
      phone,
      role = 'viewer'
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: username, email, password, first_name, last_name'
      });
    }

    // Check if user already exists
    const existingUser = await userRepo.findByUsernameOrEmail(username) || 
                        await userRepo.findByUsernameOrEmail(email);
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Username or email already exists'
      });
    }

    // Create user
    const userData = {
      user_id: randomUUID(),
      username,
      email,
      password,
      first_name,
      last_name,
      phone,
      role: role as 'admin' | 'operator' | 'viewer'
    };

    const user = await userRepo.create(userData);

    // Create audit log
    await auditRepo.create({
      entry_id: randomUUID(),
      gauge_id: 'SYSTEM',
      user_id: user.user_id,
      action: 'create',
      changes: { action: 'user_registered', username, email, role },
      previous_values: {},
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      data: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      },
      message: 'User registered successfully'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// POST /api/auth/login - Login user
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Find user (by username or email)
    const user = await userRepo.findByUsernameOrEmail(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login
    await userRepo.updateLastLogin(user.user_id);

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Create audit log
    await auditRepo.create({
      entry_id: randomUUID(),
      gauge_id: 'SYSTEM',
      user_id: user.user_id,
      action: 'update',
      changes: { action: 'user_login' },
      previous_values: {},
      timestamp: new Date()
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name
        }
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await userRepo.findById(req.user!.user_id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        last_login: user.last_login,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
});

// POST /api/auth/logout - Logout user (client-side token removal)
router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Create audit log
    await auditRepo.create({
      entry_id: randomUUID(),
      gauge_id: 'SYSTEM',
      user_id: req.user!.user_id,
      action: 'update',
      changes: { action: 'user_logout' },
      previous_values: {},
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { first_name, last_name, phone, email } = req.body;
    const userId = req.user!.user_id;

    // Get current user data for audit
    const currentUser = await userRepo.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== currentUser.email) {
      const existingUser = await userRepo.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    const updateData = {
      ...(first_name && { first_name }),
      ...(last_name && { last_name }),
      ...(phone && { phone }),
      ...(email && { email })
    };

    const updatedUser = await userRepo.update(userId, updateData);

    // Create audit log
    await auditRepo.create({
      entry_id: randomUUID(),
      gauge_id: 'SYSTEM',
      user_id: userId,
      action: 'update',
      changes: { action: 'profile_updated', ...updateData },
      previous_values: currentUser.toObject(),
      timestamp: new Date()
    });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

export default router;