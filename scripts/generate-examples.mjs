import { mkdirSync, writeFileSync } from 'node:fs';
import { exampleDecks, createExampleDeck, starterLibrary } from '../app/starter-library.ts';
const directory = new URL('../public/examples/', import.meta.url);
mkdirSync(directory, {recursive:true});
for (const example of exampleDecks) writeFileSync(new URL(`${example.id}.paperdom.json`, directory), `${JSON.stringify(createExampleDeck(example.id),null,2)}\n`);
writeFileSync(new URL('essentials.library.json',directory), `${JSON.stringify(starterLibrary,null,2)}\n`);
console.log('Generated Essentials library and three example decks.');
