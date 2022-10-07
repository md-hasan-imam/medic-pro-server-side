const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
var jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qm84bpi.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden Access' })
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {

  try {
    await client.connect();
    const serviceCollection = client.db('medicpro').collection('services');
    const appointmentsCollection = client.db('medicpro').collection('appointments');
    const usersCollection = client.db('medicpro').collection('users');
    const doctorsCollection = client.db('medicpro').collection('doctors');
    const paymentsCollection = client.db('medicpro').collection('payments');

    // verifying admin here
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'forbidden' });
      }
    }

    // creating new user / updating existing one
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET);
      res.send({ result, token });
    })

    // loading all users in dashboard
    app.get('/users', async (req, res) => {
      ;
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // making an admin 
    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    // checking user whether he is admin or not
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    })

    // deleting user account
    app.delete('/user/:email', async (req, res) => {
      const email = req.params.email;
      const query = ({ email: email });
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    // creating/ adding a new doctor 
    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    })
    // loading all doctors
    app.get('/doctor', async (req, res) => {
      const doctors = await doctorsCollection.find().toArray();
      res.send(doctors);
    })

    // deleting a doctor 

    app.delete('/doctor/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await doctorsCollection.deleteOne(query);
      res.send(result);
    })



    // loading to show all services into ui 
    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    })

    // creating new appointment 
    app.post('/appointments', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, email: booking.email };
      const alreadyAppointed = await appointmentsCollection.findOne(query);
      if (alreadyAppointed) {
        return res.send({ success: false, booking: alreadyAppointed });
      }
      const result = await appointmentsCollection.insertOne(booking);
      return res.send({ success: true, booking: booking, result });
    })

    // updating appointment after payments 
    app.patch('/booking/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }
      const result = await paymentsCollection.insertOne(payment);
      const updatedBooking = await appointmentsCollection.updateOne(filter, updatedDoc);
      res.send(updatedBooking);
    })

    // loading appointments of a single logged in user
    app.get('/appointments', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { email: patient }
        const appointments = await appointmentsCollection.find(query).toArray();
        res.send(appointments);
      } else {
        return res.status(403).send({ message: 'Forbidden Access' });
      }
    })
    // creating payment route for single service appointment
    app.get('/appointment/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentsCollection.findOne(query);
      res.send(result);
    })

    // available slots for specific date
    app.get('/available', async (req, res) => {

      const date = req.query.date;

      // getting all services
      const services = await serviceCollection.find().toArray();

      // getting booking of a specific date
      const query = { date: date }
      const appointments = await appointmentsCollection.find(query).toArray();

      // for each service, find booking for that service
      services.forEach(service => {
        const serviceAppointments = appointments.filter(book => book.treatment === service.name);
        const bookedSlots = serviceAppointments.map(book => book.slot);
        const available = service.slots.filter(slot => !bookedSlots.includes(slot));
        service.slots = available;
      })
      res.send(services);
    })

    //creating post api for payment intent
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret })
    });


  } finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`medic pro app listening on port ${port}`)
})