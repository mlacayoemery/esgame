import { Component } from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';

@Component({
	selector: 'tro-configurator',
	templateUrl: './configurator.component.html',
	styleUrls: ['./configurator.component.scss']
})
export class ConfiguratorComponent {
	private _mapMode: "grid" | "svg" = "grid";
	get mapMode(): "grid" | "svg" {
		return this._mapMode;
	}
	set mapMode(selected: "grid" | "svg") {
		selected == "grid" ? this.selectionSize = 2 : this.selectionSize = 1;
		this._mapMode = selected;
	}
	languages = ["en", "de"];

	mapWidth = 20;
	mapHeight = 20;
	selectionSize = 2;
	infiniteLevels = false;
	formGroup: FormGroup;

	constructor() {
		this.initialiseForm();
	}

	initialiseForm() {
		this.formGroup = new FormGroup({
			"mapMode": new FormControl("grid"),
			"imageMode": new FormControl(false),
			"elementSize": new FormControl(2),
			"infiniteLevels": new FormControl(false),
			"gameBoardColumns": new FormControl(28),
			"gameBoardRows": new FormControl(29),
			"productionTypes": new FormArray([]),
			"maps": new FormArray([]),
			"levels": new FormArray([])
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
			name: new FormGroup({ "en": new FormControl("Default Map"), "de": new FormControl("Standardkarte") }),
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

	addAgricultureType() {
		this.productionTypes.push(new FormGroup({
			id: new FormControl(crypto.randomUUID()),
			name: new FormGroup({ "en": new FormControl("Default Agriculture Type"), "de": new FormControl("Standard-Landwirtschaftstyp") }),
			fieldColor: new FormControl("#000000"),
			urlToIcon: new FormControl(""),
			maxElements: new FormControl(-1)
		}));
	}
	removeAgricultureType(index: number) {
		this.productionTypes.removeAt(index);
	}

	addLevel() {
		this.levels.push(new FormGroup({
			id: new FormControl(crypto.randomUUID()),
			name: new FormGroup({ "en": new FormControl("Default Level"), "de": new FormControl("Standard Level") }),
			maps: new FormControl([]),
			instructions: new FormGroup({ "en": new FormControl("Default Instructions"), "de": new FormControl("Standard Anweisungen") })
		}));
	}

	removeLevel(index: number) {
		this.levels.removeAt(index);
	}

}


class Map {
	id: string;
	name: Record<string, string>;
	urlToData: string = "";
	gradient: string;
	gameBoardType: string;
	agricultueTypes: string[];
	linkedToProductionTypes: [];
}

class AgricultureType {
	id: string;
	name: Record<string, string>;
	fieldColor: string;
	urlToIcon: string;
	maxElements: number = -1;
}

class Level {
	id: string;
	maps: String[];
	name: Record<string, string>;
	instructions: Record<string, string>;
}