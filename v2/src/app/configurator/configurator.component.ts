import { Component } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { DefaultGradients } from '../shared/helpers/gradients';
import * as uuid from 'uuid';

@Component({
    selector: 'tro-configurator',
    templateUrl: './configurator.component.html',
    styleUrls: ['./configurator.component.scss'],
    standalone: false
})
export class ConfiguratorComponent {
	formGroup: FormGroup;
	languages: string[] = [];
	gradients = Object.values(DefaultGradients);

	constructor(private translate: TranslateService) {
		this.languages = [...translate.getLangs()];
		this.initialiseForm();
	}

	initialiseForm() {
		this.formGroup = new FormGroup({
			"title": this.getLanguageControls(),
			"mapMode": new FormControl("svg"),
			"imageMode": new FormControl(false),
			"elementSize": new FormControl(2),
			"minSelected": new FormControl(0),
			"minValue": new FormControl(0),
			"maxValue": new FormControl(100),
			"highlightColor": new FormControl("#000000"),
			"infiniteLevels": new FormControl(false),
			"gameBoardColumns": new FormControl(28),
			"gameBoardRows": new FormControl(29),
			// Live from the start: it used to be constructed disabled and enabled only by the svg
			// branch of the mode toggle, which is the same weld seen from the other end.
			"calcUrl": new FormControl(""),
			"productionTypes": new FormArray([]),
			"defaultProductionType": new FormControl(""),
			"maps": new FormArray([]),
			"customColors": new FormArray([]),
			"basicInstructions": this.getLanguageControls(),
			"basicInstructionsImageUrl": new FormControl(""),
			"advancedInstructions": this.getLanguageControls(),
			"advancedInstructionsImageUrl": new FormControl(""),
			// Settings reads all of these off the dataset, and until 2026-09-05 none of them could
			// be authored here -- so a game built with this tool could not be the game this
			// repository ships. They are game properties, not deployment ones: gridLineColor,
			// gridLineWidth and highlightWidth are deliberately absent because config.json
			// overrides them per deployment (ConfigService.apply), which is where they belong.
			"clientScored": new FormControl(false),
			// A grid game scored by a calculator: the other half of the data-type axis, and the
			// reason calcUrl is no longer disabled in grid mode below.
			"backendScored": new FormControl(false),
			"paletted": new FormControl(false),
			"scoreByConversion": new FormControl(false),
			"autoOpenInstructions": new FormControl(true),
			"editablePreviousRounds": new FormControl(false),
			"optimalSolutionUrl": new FormControl(""),
			"visualOptions": new FormGroup({
				"consequenceFieldOpacity": new FormControl(false),
				"highlightFocusedBoard": new FormControl(false),
				"neutralScoreColors": new FormControl(false),
			}),
		});
		this.toggleMapMode('svg');
		this.formGroup.get('mapMode')!.valueChanges.subscribe((value) => {
			this.toggleMapMode(value);
		});
	}

	get productionTypes() {
		return this.formGroup.get('productionTypes') as FormArray;
	}

	get maps() {
		return this.formGroup.get('maps') as FormArray;
	}

	get customColors() {
		return this.formGroup.get('customColors') as FormArray;
	}

	addMap() {
		let fg = new FormGroup({
			id: new FormControl((this.maps.length + 1) * 10),
			name: this.getLanguageControls(),
			gradient: new FormControl("blue"),
			productionTypes: new FormControl([]),
			gameBoardType: new FormControl("Suitability"),
			urlToData: new FormControl(""),
			customColorId: new FormControl({value: "", disabled: true})
		});
		this.maps.push(fg);
		fg.get('gradient')!.valueChanges.subscribe((value) => {
			if (value == "custom") {
				fg.get('customColorId')?.enable();
			} else {
				fg.get('customColorId')?.disable();
			}
		});
		fg.get('gameBoardType')!.valueChanges.subscribe(value => {
			if (this.formGroup.get('mapMode')?.value == 'grid') return;
			if (value == "Consequence") {
				fg.get('urlToData')?.disable();
			} else {
				fg.get('urlToData')?.enable();
			}
			if (value == 'Drawing') {
				fg.get('productionTypes')?.disable();
				fg.get('gradient')?.disable();
			} else {
				fg.get('productionTypes')?.enable();
				fg.get('gradient')?.enable();
			}
		});
	}

	removeMap(index: number) {
		this.maps.removeAt(index);
	}

	addProductionType() {
		this.productionTypes.push(new FormGroup({
			id: new FormControl((this.productionTypes.length + 1) * 11),
			name: this.getLanguageControls(),
			fieldColor: new FormControl("#000000"),
			urlToIcon: new FormControl(""),
			maxElements: new FormControl(0)
		}));
	}

	addCustomColors(addEmpty = false) {
		this.customColors.push(new FormGroup({
			id: new FormControl(uuid.v4()),
			colors: new FormArray([])
		}));
		if (!addEmpty) {
			this.addColor(this.customColors.controls[this.customColors.controls.length - 1]);
		}
	}

	addColor(formGroup: AbstractControl) {
		this.getColorsArray(formGroup).push(new FormGroup({
			number: new FormControl(),
			color: new FormControl("#000000")
		}));
	}

	removeColor(formGroup: AbstractControl, index: number) {
		this.getColorsArray(formGroup).removeAt(index);
	}

	removeColorSet(index: number) {
		this.customColors.removeAt(index);
	}

	getColorsArray(formGroup: AbstractControl) {
		return formGroup.get('colors') as FormArray;
	}

	removeProductionType(index: number) {
		this.productionTypes.removeAt(index);
	}

	getLanguageControls() {
		let fg = new FormGroup({});
		this.languages.forEach((lang) => {
			fg.addControl(lang, new FormControl());
		});
		return fg;
	}

	exportData() {
		const data = JSON.stringify(this.formGroup.getRawValue());
		let a = document.createElement('a');
		a.href = `data:text/json;charset=utf-8,${encodeURIComponent(data)}`;
		a.download = 'configuration.json';
		a.click();
	}

	onFileSelected(event: Event) {
		const file: File = (event.target as HTMLInputElement).files![0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e: any) => {
				const contents = e.target.result;
				// JSON.parse here throws ASYNCHRONOUSLY — this runs in FileReader.onload, so no
				// caller can catch it and picking the wrong file looked exactly like picking no
				// file at all: nothing imported, nothing said. ImportConfigComponent already
				// carries this fix and a comment about it; this half was missed.
				//
				// Parsing is not enough on its own. `[1,2,3]` and `null` parse cleanly and then
				// read as a configuration with no maps and no production types, which is the same
				// silent-empty-board outcome by a different route.
				let value: any;
				try {
					value = JSON.parse(contents);
				} catch (err) {
					console.error(err);
					alert("That file could not be read as a game configuration.");
					return;
				}
				if (!value || typeof value !== 'object' || Array.isArray(value)) {
					console.error(`imported configuration is not a JSON object:`, value);
					alert("That file could not be read as a game configuration.");
					return;
				}
				this.loadConfiguration(value);
			};
			reader.readAsText(file);
		}
	}

	/**
	 * Which fields the chosen unit selection actually uses.
	 *
	 * ONLY `calcUrl` AND THE SVG-ONLY SCALING FIELDS ARE TIED TO THE MODE, and each because the
	 * app is: `GameService.goToNextLevel` POSTs only when `mode == 'SVG'`, and the GRID branch of
	 * `prepareNextLevel` never reads a CalculationResult, so a `calcUrl` on a grid game buys
	 * nothing but a way to fail.
	 *
	 * Everything else used to be tied to it too, and that was wrong. `elementSize` and the board
	 * dimensions describe the BOARD, not how a unit is drawn: this tool forced `elementSize` to 1
	 * and disabled the dimensions whenever mapMode was svg, which made the shipped SVG example --
	 * a 28 x 29 board of 2 x 2 pieces -- impossible to author here. Unit selection and data type
	 * are two axes (docs/static-vs-dynamic.rst); this form now conflates them only where the
	 * runtime does.
	 *
	 * `elementSize` > 1 means the board is a rectangular grid of units, which is what
	 * `GameService.getAssociatedFields` assumes when it steps by `gameBoardColumns`. An SVG board
	 * whose zones are irregular -- the hexagons of assets/data.json -- must leave it at 1.
	 */
	setModeAvailability(value: string) {
		// calcUrl was here until 2026-09-05, disabled in grid mode because the runtime ignored it.
		// It does not any more: a grid game whose dataset sets `backendScored` POSTs its round and
		// builds the next level from what comes back, so a calculator is authorable for either
		// unit selection. What stays mode-bound is the SVG scaling, which only the SVG boards read.
		const svgOnly = ['minSelected', 'minValue', 'maxValue'];
		svgOnly.forEach(name => value == "svg"
			? this.formGroup.get(name)!.enable()
			: this.formGroup.get(name)!.disable());
	}

	/**
	 * The values a fresh game of this kind starts from, applied when a PERSON changes the mode.
	 *
	 * Kept apart from availability so that importing a configuration cannot have its own values
	 * overwritten by the defaults of the mode it declares -- which is order-dependent and was
	 * silently losing imported fields.
	 */
	applyModeDefaults(value: string) {
		if (value == "svg") {
			this.formGroup.get('infiniteLevels')!.setValue(true);
		} else {
			this.formGroup.get('minSelected')!.setValue(0);
			this.formGroup.get('minValue')!.setValue(0);
			this.formGroup.get('maxValue')!.setValue(100);
			this.formGroup.get('infiniteLevels')!.setValue(false);
		}
	}

	/**
	 * Fill the form from a parsed configuration.
	 *
	 * Split out of onFileSelected because the interesting half has nothing to do with files, and
	 * because "can this tool express the games this repository ships?" is a question worth
	 * answering with a test rather than by reading the form -- see the round-trip in
	 * configurator.component.spec.ts.
	 *
	 * The rows come first: a FormArray with no entries silently drops the values patched into it,
	 * which is why maps, production types and colour sets are added one per entry before
	 * patchValue rather than after.
	 *
	 * Availability is re-applied AFTERWARDS and the mode's defaults deliberately are not. Patching
	 * `mapMode` fires the valueChanges subscription mid-patch, so applying defaults there would
	 * overwrite fields the file had already set -- infiniteLevels and elementSize both went that
	 * way -- and whether it did depended on key order in the JSON.
	 */
	loadConfiguration(value: any) {
		value.maps?.forEach((_: any) => {
			this.addMap();
		});
		value.productionTypes?.forEach((_: any) => {
			this.addProductionType();
		});
		value.customColors?.forEach((customColor: any) => {
			this.addCustomColors(true);
			customColor.colors?.forEach(() => {
				this.addColor(this.customColors.controls[this.customColors.controls.length - 1]);
			});
		});
		this.formGroup.patchValue(value);
		this.setModeAvailability(this.formGroup.get('mapMode')!.value);
	}

	toggleMapMode(value: string) {
		this.setModeAvailability(value);
		this.applyModeDefaults(value);
	}

	formatLabel(value: number | undefined) {
		return value + '%';
	}
}
