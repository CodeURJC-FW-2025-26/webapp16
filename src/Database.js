import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';

const client = new MongoClient(uri);

    await client.connect();
    console.log('✅ Conectado correctamente a MongoDB');

    const db = client.db('Softflix');
    const Softflix = db.collection('Softflix');

    await Softflix.insertOne({
        titulo: 'Matrix',
        año: 1999,
        genero: 'Ciencia ficción'
    });

                                              