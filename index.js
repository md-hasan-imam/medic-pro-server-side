const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qm84bpi.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db('medicpro').collection('services');
    const appointmentsCollection = client.db('medicpro').collection('appointments');


    // loading to show all services into ui 
    app.get('/services',async(req,res)=>{
      const query={};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    })

    // creating new appointment 
    app.post('/appointments',async(req, res)=>{
      const newAppointment= req.body;
      const result = await appointmentsCollection.insertOne(newAppointment);
      res.send(result);
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