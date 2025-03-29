const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'public/uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Not an image! Please upload an image.'), false);
        }
    }
});

// Store data in memory (will reset when server restarts)
let blogPosts = [];
let users = [];
let currentUser = null;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Routes
app.get('/', (req, res) => {
    res.render('index', { posts: blogPosts, currentUser });
});

app.get('/login', (req, res) => {
    res.render('login', { currentUser });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Invalid credentials', currentUser });
    }
});

app.get('/register', (req, res) => {
    res.render('register', { currentUser });
});

app.post('/register', upload.single('profilePicture'), (req, res) => {
    const { username, password, email } = req.body;
    const profilePicture = req.file ? `/uploads/${req.file.filename}` : '/images/default-avatar.png';
    
    if (users.some(u => u.username === username)) {
        return res.render('register', { error: 'Username already exists', currentUser });
    }

    const user = {
        id: Date.now(),
        username,
        password,
        email,
        profilePicture,
        createdAt: new Date().toLocaleDateString()
    };

    users.push(user);
    currentUser = user;
    res.redirect('/');
});

app.get('/logout', (req, res) => {
    currentUser = null;
    res.redirect('/');
});

app.get('/new-post', (req, res) => {
    if (!currentUser) {
        return res.redirect('/login');
    }
    res.render('new-post', { currentUser });
});

app.post('/create-post', upload.single('postImage'), (req, res) => {
    if (!currentUser) {
        return res.redirect('/login');
    }

    const { title, content } = req.body;
    const postImage = req.file ? `/uploads/${req.file.filename}` : null;
    
    const post = {
        id: Date.now(),
        title,
        content,
        image: postImage,
        author: {
            id: currentUser.id,
            username: currentUser.username,
            profilePicture: currentUser.profilePicture
        },
        date: new Date().toLocaleDateString(),
        likes: [],
        dislikes: [],
        comments: []
    };
    
    blogPosts.unshift(post);
    res.redirect('/');
});

app.get('/post/:id', (req, res) => {
    const post = blogPosts.find(p => p.id === parseInt(req.params.id));
    if (!post) {
        return res.status(404).render('404');
    }
    res.render('post', { post, currentUser });
});

// Like/Dislike routes
app.post('/post/:id/like', (req, res) => {
    if (!currentUser) {
        return res.status(401).json({ error: 'Please login to like posts' });
    }
    
    const post = blogPosts.find(p => p.id === parseInt(req.params.id));
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }

    const userLiked = post.likes.includes(currentUser.id);
    const userDisliked = post.dislikes.includes(currentUser.id);

    if (userLiked) {
        post.likes = post.likes.filter(id => id !== currentUser.id);
    } else {
        post.likes.push(currentUser.id);
        if (userDisliked) {
            post.dislikes = post.dislikes.filter(id => id !== currentUser.id);
        }
    }

    res.json({
        likes: post.likes.length,
        dislikes: post.dislikes.length
    });
});

app.post('/post/:id/dislike', (req, res) => {
    if (!currentUser) {
        return res.status(401).json({ error: 'Please login to dislike posts' });
    }
    
    const post = blogPosts.find(p => p.id === parseInt(req.params.id));
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }

    const userLiked = post.likes.includes(currentUser.id);
    const userDisliked = post.dislikes.includes(currentUser.id);

    if (userDisliked) {
        post.dislikes = post.dislikes.filter(id => id !== currentUser.id);
    } else {
        post.dislikes.push(currentUser.id);
        if (userLiked) {
            post.likes = post.likes.filter(id => id !== currentUser.id);
        }
    }

    res.json({
        likes: post.likes.length,
        dislikes: post.dislikes.length
    });
});

// Comment routes
app.post('/post/:id/comment', (req, res) => {
    if (!currentUser) {
        return res.status(401).json({ error: 'Please login to comment' });
    }
    
    const post = blogPosts.find(p => p.id === parseInt(req.params.id));
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }

    const comment = {
        id: Date.now(),
        content: req.body.content,
        author: {
            id: currentUser.id,
            username: currentUser.username,
            profilePicture: currentUser.profilePicture
        },
        date: new Date().toLocaleDateString()
    };

    post.comments.push(comment);
    res.redirect(`/post/${req.params.id}`);
});

// Edit routes
app.get('/post/:id/edit', (req, res) => {
    if (!currentUser) {
        return res.redirect('/login');
    }
    
    const post = blogPosts.find(p => p.id === parseInt(req.params.id));
    if (!post) {
        return res.status(404).render('404');
    }
    
    if (post.author.id !== currentUser.id) {
        return res.status(403).render('403');
    }
    
    res.render('edit-post', { post, currentUser });
});

app.post('/post/:id/edit', upload.single('postImage'), (req, res) => {
    if (!currentUser) {
        return res.redirect('/login');
    }
    
    const postIndex = blogPosts.findIndex(p => p.id === parseInt(req.params.id));
    if (postIndex === -1) {
        return res.status(404).render('404');
    }
    
    if (blogPosts[postIndex].author.id !== currentUser.id) {
        return res.status(403).render('403');
    }

    const { title, content } = req.body;
    const postImage = req.file ? `/uploads/${req.file.filename}` : blogPosts[postIndex].image;

    blogPosts[postIndex] = {
        ...blogPosts[postIndex],
        title,
        content,
        image: postImage,
        date: new Date().toLocaleDateString()
    };

    res.redirect(`/post/${req.params.id}`);
});

// Delete route
app.post('/post/:id/delete', (req, res) => {
    if (!currentUser) {
        return res.redirect('/login');
    }
    
    const postIndex = blogPosts.findIndex(p => p.id === parseInt(req.params.id));
    if (postIndex === -1) {
        return res.status(404).render('404');
    }
    
    if (blogPosts[postIndex].author.id !== currentUser.id) {
        return res.status(403).render('403');
    }

    blogPosts.splice(postIndex, 1);
    res.redirect('/');
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404');
});

app.listen(port, () => {
    console.log(`Blog application running at http://localhost:${port}`);
}); 