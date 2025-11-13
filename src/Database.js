import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';

/**
 * Initialize MongoDB connection and attach to app.locals.db
 * @param {import('express').Application} app
 */
export default async function initDB(app) {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('Softflix');
    app.locals.db = db;
    app.locals.dbClient = client;
    console.log('Connected to MongoDB (Softflix)');

    // Seed initial films if the collection is empty — keep existing data intact
    const filmsColl = db.collection('films');
    const count = await filmsColl.countDocuments();
    if (count === 0) {
        console.log('Seeding initial films into collection "films"');
        await filmsColl.insertMany([
            {
                Title: 'Interstellar',
                description: 'In a future where Earth is slowly dying, humanitys survival depends on venturing into the stars. A former pilot is recruited for a daring mission: to travel through a newly discovered wormhole and search for a new home among the stars.As the crew faces unimaginable challenges across space and time, their journey becomes not only a fight for survival, but also a profound exploration of love, sacrifice, and the very limits of human possibility.',
                Realase_year: '2014',
                Gender: 'Science fiction',
                Calification: '5/5',
                Age_classification: '+13',
                Director: 'Christopher Nolan',
                Casting: 'Matthew McConaughey, Jessica Chastain, Anne Hathaway',
                Duration: '2h 49min'
            },
            {
                Title: 'How to train your dragon',
                description: 'Hiccup, a teenage Viking, begins dragon training classes, and finally sees an opportunity to prove he is capable of becoming a warrior, when he befriends an injured dragon.',
                Realase_year: '2010',
                Gender: 'Action',
                Calification: '4/5',
                Age_classification: '+7',
                Director: 'Chris Sanders, Dean DeBlois',
                Casting: 'Jay Baruchel, Gerard Butler, America Ferrara',
                Duration: '1h 38min'
            },
            {
                Title: 'The secret live of Walter Mity',
                description: 'Walter Mitty, photo editor at Life magazine,has spent his whole life taking little "mental vacations" to escape his boring existence, moments in which he becomes the imaginary protagonist of fantastic adventures.',
                Realase_year: '2013',
                Gender: 'Action, comedy',
                Calification: '5/5',
                Age_classification: '+12',
                Director: 'Ben Stiller',
                Casting: 'Ben Stiller, Kristen Wiig, Sean Penn',
                Duration: '1h 54min'
            }
        ]);
    } else {
        console.log(`Films collection already contains ${count} document(s); skipping seed.`);
    }
}
                                              