import { MongoClient, ObjectId } from 'mongodb';
const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('Softflix');
const movies = db.collection('Films');

export const UPLOADS_FOLDER = './uploads';

router.get('/', async (req, res) => {
    let movies = await moviesCollection.find().toArray();
    res.render('index', { movies });
});

await Softflix.insertOne({
    title: 1917,
    year: 2019
});                                                 