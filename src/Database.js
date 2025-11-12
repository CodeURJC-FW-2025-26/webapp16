import { MongoClient } from 'mongodb';
import express from 'express';

const uri = 'mongodb://localhost:27017';
const router = express.Router();

const client = new MongoClient(uri);

    await client.connect();
    const db = client.db('Softflix');
    const Softflix = db.collection('Softflix');

    await Softflix.insertMany([
        {
         Title: 'Interstellar',
         description: 'In a future where Earth is slowly dying, humanitys survival depends on venturing into the stars. A former pilot is recruited for a daring mission: to travel through a newly discovered wormhole and search for a new home among the stars.As the crew faces unimaginable challenges across space and time, their journey becomes not only a fight for survival, but also a profound exploration of love, sacrifice, and the very limits of human possibility.',
         Realase_year: '2014', 
         Gender: 'Science fiction', 
         Calification: 5/5, 
         Age_classification: +13, 
         Director: 'Christopher Nolan', 
         Casting: 'Matthew McConaughey, Jessica Chastain, Anne Hathaway',
         Duration: '2h 49min'
        }
    ]);

export default router;
                                              