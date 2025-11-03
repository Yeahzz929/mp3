// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to MongoDB Atlas
var mongoUri = process.env.MONGODB_URI;
if (!mongoUri || typeof mongoUri !== 'string' || mongoUri.trim() === '') {
    console.error('Error: MONGODB_URI environment variable is not set or is empty');
    console.error('Please set MONGODB_URI in your .env file with a valid MongoDB connection string');
    process.exit(1);
}

// Clean up the connection string (remove quotes if any)
mongoUri = mongoUri.trim();
if ((mongoUri.startsWith('"') && mongoUri.endsWith('"')) || 
    (mongoUri.startsWith("'") && mongoUri.endsWith("'"))) {
    mongoUri = mongoUri.slice(1, -1);
}

// Validate connection string format
if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    console.error('Error: MONGODB_URI must start with mongodb:// or mongodb+srv://');
    console.error('Current value starts with: ' + (mongoUri.substring(0, 20) || 'empty'));
    process.exit(1);
}

mongoose.set('strictQuery', true);

// Allow CORS so that backend and frontend could be put on different servers
var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

// Use the body-parser package in our application
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

// Use routes as a module (see index.js)
require('./routes')(app, router);

// Connect to MongoDB first, then start server
// Use options compatible with Mongoose 5.x and modern MongoDB
mongoose.connect(mongoUri, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    useCreateIndex: true, // Use createIndex instead of ensureIndex
    useFindAndModify: false // Use findOneAndUpdate instead of findAndModify
})
    .then(function(){
        console.log('MongoDB connected');
        // Start the server only after MongoDB connection succeeds
        app.listen(port, function() {
            console.log('Server running on port ' + port);
        });
    })
    .catch(function(err){
        var errorMsg = 'MongoDB connection error: ';
        if (err && err.message) {
            errorMsg += err.message;
        } else if (err) {
            errorMsg += String(err);
        } else {
            errorMsg += 'Unknown error';
        }
        console.error(errorMsg);
        console.error('Please check your MONGODB_URI in .env file');
        console.error('Connection string should start with mongodb:// or mongodb+srv://');
        process.exit(1);
    });
