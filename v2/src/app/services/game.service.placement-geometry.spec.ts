import { firstValueFrom } from 'rxjs';
import { GameService } from './game.service';
import { ProductionType } from '../shared/models/production-type';

// getAssociatedFields decides what a player actually gets when they click. It is index
// arithmetic with two separate edge clamps — one for the right edge, one for the bottom — and
// the existing specs pin it to elementSize 2 on a 4x4 board with worked examples.
//
// This checks the PROPERTIES instead, across sizes and non-square boards, because the clamps
// contain `elementSize` and `columns` in ways that a single board shape cannot exercise. Four
// things have to hold for every cell of every board:
//
//   1. the block is elementSize x elementSize cells
//   2. every cell is on the board
//   3. the cells form a contiguous square
//   4. the block contains the cell that was clicked
//
// (4) is the one a player would notice: clamping a block back onto the board must not slide it
// off the cell they aimed at.

const translateStub: any = { getLangs: () => [], setTranslation: () => { } };

const settingsFor = (columns: number, rows: number, elementSize: number) => ({
	title: { en: 'T' }, mapMode: 'grid', elementSize,
	gameBoardColumns: columns, gameBoardRows: rows,
	productionTypes: [], maps: [], customColors: []
});

/** One click on a fresh service, so blocks never collide with each other. */
const blockFor = async (columns: number, rows: number, elementSize: number, id: number) => {
	const service = new GameService({} as any, {} as any, translateStub, {} as any);
	service.loadSettings(settingsFor(columns, rows, elementSize));
	service.setSelectedProductionType(new ProductionType(1, '#000000', null as any, '', 0));
	service.selectField(id);
	const fields = await firstValueFrom(service.selectedFieldsObs);
	return fields.flatMap(f => f.fields.map(x => x.id)).sort((a, b) => a - b);
};

// Square and non-square, and a board narrower than it is tall, since the two clamps use
// `columns` and `rows` differently.
const boards: [number, number][] = [[4, 4], [5, 3], [3, 5], [6, 6], [7, 4]];

describe('getAssociatedFields geometry', () => {
	for (const [columns, rows] of boards) {
		for (const elementSize of [1, 2, 3]) {
			if (elementSize > columns || elementSize > rows) continue;   // block cannot fit

			it(`${columns}x${rows}, blocks of ${elementSize}: every cell yields a valid block`, async () => {
				const problems: string[] = [];

				for (let id = 0; id < columns * rows; id++) {
					const block = await blockFor(columns, rows, elementSize, id);
					const where = `${columns}x${rows} size ${elementSize} click ${id} -> [${block}]`;

					if (block.length !== elementSize * elementSize) {
						problems.push(`${where}: ${block.length} cells, expected ${elementSize * elementSize}`);
						continue;
					}
					if (block.some(c => c < 0 || c >= columns * rows)) {
						problems.push(`${where}: off the board`);
						continue;
					}
					// Contiguous square: the columns used must be elementSize consecutive ones,
					// and likewise the rows. This also catches a block that wrapped across an
					// edge, which stays in range but is not a square.
					const cols = [...new Set(block.map(c => c % columns))].sort((a, b) => a - b);
					const rws = [...new Set(block.map(c => Math.floor(c / columns)))].sort((a, b) => a - b);
					const consecutive = (xs: number[]) => xs.length === elementSize
						&& xs.every((x, i) => i === 0 || x === xs[i - 1] + 1);
					if (!consecutive(cols) || !consecutive(rws)) {
						problems.push(`${where}: not a contiguous ${elementSize}x${elementSize} square`);
						continue;
					}
					if (!block.includes(id)) {
						problems.push(`${where}: does not contain the clicked cell`);
					}
				}

				expect(problems).toEqual([]);
			});
		}
	}
});
