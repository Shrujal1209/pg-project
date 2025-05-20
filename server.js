const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add OPTIONS handling for preflight requests
app.options('*', cors());

// Serve static files
app.use(express.static(path.join(__dirname)));

// In-memory database (for demonstration purposes)
// In a real application, you would use MongoDB or another database
const users = [];
const rooms = [];
const bookings = [];
const payments = [];

// JWT Secret
const JWT_SECRET = 'your-secret-key';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Access denied' });
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token' });
  }
};

// Routes

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// User Authentication Routes
app.post('/api/signup', async (req, res) => {
  try {
    console.log('Received signup request:', req.body);
    const { fullname, email, password, phone, username, gender } = req.body;
    
    // Check if user already exists
    const userExists = users.find(user => user.email === email || user.username === username);
    if (userExists) {
      console.log('User already exists:', email, username);
      return res.status(400).json({ message: 'User already exists with this email or username' });
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = {
      id: users.length + 1,
      name: fullname,
      email,
      username,
      password: hashedPassword,
      phone,
      gender,
      role: 'user',
      createdAt: new Date()
    };
    
    users.push(newUser);
    console.log('New user created:', newUser.id, newUser.email);
    
    // Create token
    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET);
    
    const response = { 
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    };
    
    console.log('Sending signup response:', response);
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = users.find(user => user.email === email);
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    
    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    
    // Create token
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
    
    res.status(200).json({ 
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Room Management Routes
app.get('/api/rooms', (req, res) => {
  res.status(200).json(rooms);
});

app.post('/api/rooms', authenticateToken, (req, res) => {
  try {
    const { roomNumber, type, price, capacity, amenities, status } = req.body;
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    
    // Check if room already exists
    const roomExists = rooms.find(room => room.roomNumber === roomNumber);
    if (roomExists) {
      return res.status(400).json({ message: 'Room already exists' });
    }
    
    // Create new room
    const newRoom = {
      id: rooms.length + 1,
      roomNumber,
      type,
      price,
      capacity,
      amenities,
      status: status || 'available',
      createdAt: new Date()
    };
    
    rooms.push(newRoom);
    
    res.status(201).json({ 
      message: 'Room added successfully',
      room: newRoom
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Booking Routes
app.post('/api/bookings', authenticateToken, (req, res) => {
  try {
    const { roomId, checkIn, checkOut, guests } = req.body;
    
    // Find room
    const room = rooms.find(room => room.id === parseInt(roomId));
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Check if room is available
    if (room.status !== 'available') {
      return res.status(400).json({ message: 'Room is not available' });
    }
    
    // Create booking
    const newBooking = {
      id: bookings.length + 1,
      userId: req.user.id,
      roomId: room.id,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guests,
      status: 'pending',
      totalAmount: calculateAmount(room.price, new Date(checkIn), new Date(checkOut)),
      createdAt: new Date()
    };
    
    bookings.push(newBooking);
    
    // Update room status
    room.status = 'booked';
    
    res.status(201).json({ 
      message: 'Booking created successfully',
      booking: newBooking
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/bookings', authenticateToken, (req, res) => {
  try {
    // Filter bookings by user ID (if not admin)
    let userBookings;
    if (req.user.role === 'admin') {
      userBookings = bookings;
    } else {
      userBookings = bookings.filter(booking => booking.userId === req.user.id);
    }
    
    res.status(200).json(userBookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Payment Routes
app.post('/api/payments', authenticateToken, (req, res) => {
  try {
    const { bookingId, amount, paymentMethod, paymentDetails } = req.body;
    
    // Find booking
    const booking = bookings.find(booking => booking.id === parseInt(bookingId));
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    // Check if user owns the booking
    if (booking.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Create payment
    const newPayment = {
      id: payments.length + 1,
      bookingId: booking.id,
      userId: req.user.id,
      amount,
      paymentMethod,
      paymentDetails,
      status: 'completed',
      transactionId: generateTransactionId(),
      createdAt: new Date()
    };
    
    payments.push(newPayment);
    
    // Update booking status
    booking.status = 'confirmed';
    
    res.status(201).json({ 
      message: 'Payment processed successfully',
      payment: newPayment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin Routes
app.get('/api/admin/users', authenticateToken, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    
    // Return users without passwords
    const safeUsers = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    
    res.status(200).json(safeUsers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/admin/payments', authenticateToken, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    
    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper functions
function calculateAmount(pricePerDay, checkIn, checkOut) {
  const days = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  return pricePerDay * days;
}

function generateTransactionId() {
  return 'TXN' + Date.now() + Math.floor(Math.random() * 1000);
}

// Create an admin user if none exists
if (!users.find(user => user.role === 'admin')) {
  (async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    
    users.push({
      id: users.length + 1,
      name: 'Admin User',
      email: 'admin@example.com',
      password: hashedPassword,
      phone: '1234567890',
      role: 'admin',
      createdAt: new Date()
    });
    
    console.log('Admin user created with email: admin@example.com and password: admin123');
  })();
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the application`);
});