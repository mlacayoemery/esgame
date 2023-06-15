import { Component } from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

@Component({
	selector: 'tro-configurator',
	templateUrl: './configurator.component.html',
	styleUrls: ['./configurator.component.scss']
})
export class ConfiguratorComponent {
	formGroup: FormGroup;
	languages: string[] = [];

	constructor(private translate: TranslateService) {
		this.initialiseForm();
		this.languages = translate.getLangs();
	}

	initialiseForm() {
		this.formGroup = new FormGroup({
			"mapMode": new FormControl("grid"),
			"imageMode": new FormControl(false),
			"elementSize": new FormControl(2),
			"highlightColor": new FormControl("#000000"),
			"infiniteLevels": new FormControl(false),
			"gameBoardColumns": new FormControl(28),
			"gameBoardRows": new FormControl(29),
			"productionTypes": new FormArray([]),
			"maps": new FormArray([]),
			"levels": new FormArray([])
		});
		this.formGroup.get('mapMode')!.valueChanges.subscribe((value) => {
			if (value == "svg") {
				this.formGroup.get('elementSize')!.disable();
				this.formGroup.get('elementSize')!.setValue(1);
			} else {
				this.formGroup.get('elementSize')!.enable();
			}
		});
	}

	get productionTypes() {
		return this.formGroup.get('productionTypes') as FormArray;
	}

	get maps() {
		return this.formGroup.get('maps') as FormArray;
	}

	get levels() {
		return this.formGroup.get('levels') as FormArray;
	}

	addMap() {
		this.maps.push(new FormGroup({
			id: new FormControl(crypto.randomUUID()),
			name: this.getLanguageControls(),
			gradient: new FormControl("blue"),
			productionTypes: new FormControl([]),
			gameBoardType: new FormControl("Suitablity"),
			linkedToProductionTypes: new FormArray([]),
			urlToData: new FormControl("")
		}));
	}

	removeMap(index: number) {
		this.maps.removeAt(index);
	}

	addProductionType() {
		this.productionTypes.push(new FormGroup({
			id: new FormControl(crypto.randomUUID()),
			name: this.getLanguageControls(),
			fieldColor: new FormControl("#000000"),
			urlToIcon: new FormControl(""),
			maxElements: new FormControl(-1)
		}));
	}
	removeProductionType(index: number) {
		this.productionTypes.removeAt(index);
	}

	addLevel() {
		this.levels.push(new FormGroup({
			id: new FormControl(crypto.randomUUID()),
			name: this.getLanguageControls(),
			maps: new FormControl([]),
			instructions: this.getLanguageControls(),
		}));
	}

	removeLevel(index: number) {
		this.levels.removeAt(index);
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
		var a = document.createElement('a');
		a.href = `data:text/json;charset=utf-8,${encodeURIComponent(data)}`;
		a.download = 'configuration.json';
		a.click();
	}
}
