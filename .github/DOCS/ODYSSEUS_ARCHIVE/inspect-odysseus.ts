import { OdysseusEngine } from '../lib/services/odysseus/OdysseusEngine';
import * as fs from 'fs';

async function inspect() {
    console.log('--- Inspecting Odysseus Search UI ---');
    const engine = new OdysseusEngine();
    await engine.init(false);

    await engine.login();

    const page = engine.odysseusPage;
    if (!page) throw new Error('Failed to capture Odysseus page');

    // Let the search form load completely
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // give it a sec to run its init scripts

    const html = await page.content();
    fs.writeFileSync('odysseus-search.html', html);
    console.log('Saved HTML to odysseus-search.html. You can inspect the DOM classes now.');

    await engine.close();
}

inspect();
