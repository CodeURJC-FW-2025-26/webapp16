import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function initDB(app) {
    await client.connect();
    const db = client.db('Softflix');
    const Softflix = db.collection('Softflix');

    app.locals.db = db;
    await Softflix.insertMany([
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
        },
        {
         Title: 'Dunkerke',
         description: 'Germany advances into France, trapping Allied troops on the beaches of Dunkirk.Under air and ground protection from British and French forces, the troops are slowly evacuated from the beach using any available vessels.',
         Realase_year: '2017', 
         Gender: 'Action', 
         Calification: '3/5', 
         Age_classification: '+12', 
         Director: 'Christopher Nolan', 
         Casting: 'Harry Styles, Fionn Whitehead, Cillian Murphy',
         Duration: '1h 46min'
        },
        {
         Title: 'Megamind',
         description: 'Megamind is a supervillain.For years, he has tried to conquer Metro City, but a hero named Metro Man stood in his way.After many attempts, Megamind finally manages to kill him.Suddenly, his life has no meaning.What can a supervillain do without a superhero to fight? Create Titan, a new hero.',
         Realase_year: '2010', 
         Gender: 'Comedy', 
         Calification: '4/5', 
         Age_classification: 'All ages', 
         Director: 'Tom McGrath', 
         Casting: 'Will Ferrell, Tom McGrath, Ben Stiller ',
         Duration: '1h 35min'
        },
        {
         Title: 'Tenet',
         description: 'An epic action story revolving around international espionage, time travel, and evolution, in which a secret agent must prevent World War III.',
         Realase_year: '2020',
         Gender: 'Science-Fiction',
         Calification: '4/5',
         Age_classification: '+12',
         Director: 'Christopher Nolan',
         Casting: 'John David Washington, Elizabeth Debicki, Robert Patinson',
         Duration: '2h 30min'
        },
        {
         Title: 'Spiderman-Far-From-Home',
         description: ' Peter Parker decides to take a well-deserved vacation in Europe with MJ, Ned, and the rest of his friends. However, Peter must don the Spider-Man suit once again when Nick Fury entrusts him with a new mission: to stop an attack by creatures that are causing chaos across the continent.',
         Realase_year: '2019',
         Gender: 'Science-Fiction',
         Calification: '4/5',
         Age_classification: '+12',
         Director: 'Jon Watts',
         Casting: 'Tom Holland, Zendaya, Jake Gyllenhaal ',
         Duration: ' 2h 10min'
        },
        {
            Title: 'Saving private Ryan',
            description: 'Following the Normandy landings, in the midst of World War II, American soldiers must risk their lives to save Private James Ryan, whose three brothers have died in the war.',
            Realase_year: '1998',
            Gender: 'Action',
            Calification: '5/5',
            Age_classification: '+12',
            Director: ' Steven Spielberg',
            Casting: 'Tom Hanks, Matt Damon, Vin Diesel',
            Duration: '2h 49min'
        },
        {
            Title: 'Súper López',
            description: ' The planet Chitón is about to fall into the hands of an evil leader.Its inhabitants only hope is the baby Jo-Con-Él, who is sent to Earth in a rocket that does not quite land where his parents intended.',
            Realase_year: '2018',
            Gender: 'Comedy',
            Calification: '3/5',
            Age_classification: 'All ages',
            Director: 'Javier Ruiz Caldera',
            Casting: 'Dani Rovira, Alexandra Jiménez, Maribel Verdú',
            Duration: '1h 48min'
        },
        {
            Title: 'Only the Brave',
            description: ' Film based on Sean Flynn,s GQ article about the first municipal fire department to become an elite squad, the Granite Mountain Hotshots, who had to face the massive wildfire that broke out in Yarnell Hill, Arizona, in June 2013.',
            Realase_year: '2017',
            Gender: 'Action',
            Calification: '4/5',
            Age_classification: '+12',
            Director: 'Joseph Kosinski',
            Casting: 'Josh Brolin, Miles Tiller, Jeff Bridges',
            Duration: '2h 13min'
        },
        {
            Title: 'The secret soldiers of benghazi',
            description: 'On September 11, 2012, the United States embassy in the Libyan city of Benghazi was the target of a terrorist attack. Six former elite soldiers, whose mission was to protect the CIA, fought fiercely to defend the embassy staff. ',
            Realase_year: '2016',
            Gender: 'Action',
            Calification: '4/5',
            Age_classification: '+16',
            Director: 'Michael Bay',
            Casting: 'John Krasinski, James Badge Dale, Max Martini',
            Duration: '2h 24min'
        },
        {
            Title: '1917',
            description: ' The film follows two young British soldiers over the course of a single day in the darkest days of World War I.',
            Realase_year: '2019',
            Gender: 'Action',
            Calification: '5/5',
            Age_classification: '+12',
            Director: 'Sam Mendes',
            Casting: 'George MacKay, Richard Madden',
            Duration: '1h 59min'
        }

    ]);
}

export default initDB;
