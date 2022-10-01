const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
var jwt = require('jsonwebtoken');

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qm84bpi.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message:'unauthorized access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET , function(err, decoded) {
    if(err){
      return res.status(403).send({message: 'Forbidden Access'})
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
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ result, token });
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

    // loading appointments of a single logged in user
    app.get('/appointments',verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      console.log(decodedEmail);
      if(patient === decodedEmail){
        const query = { email: patient }
        const appointments = await appointmentsCollection.find(query).toArray();
        res.send(appointments);
      }else{
        return res.status(403).send({message: 'Forbidden Access'});
      }
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