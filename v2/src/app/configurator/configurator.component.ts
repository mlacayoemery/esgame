import { Component } from '@angular/core';

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
  maps : Map[] = [];
  agircultureTypes : AgricultureType[] = [];
  levels : Level[] = []



  addMap() {
    this.maps.push({ 
      id: crypto.randomUUID(),
      name: {"en": "Default Map", "de": "Standard Karte"}, 
      gradient: "blue", 
      agricultueTypes: [],
      gameBoardType: "Suitablity", 
      linkedToProductionTypes: [],
      urlToData: "" });
  }
  removeMap(index: number) {
    this.maps.splice(index, 1);
  }

  addAgricultureType() {
    this.agircultureTypes.push({
      id: crypto.randomUUID(),
      name: {"en": "Default Agriculture Type", "de": "Standard Landwirtschaftstyp"},
      fieldColor: "#000000",
      urlToIcon: "",
      maxElements: -1
    });
  }
  removeAgricultureType(index: number) {
    this.agircultureTypes.splice(index, 1);
  }

  addLevel() {
    this.levels.push({
      id: crypto.randomUUID(),
      name: {"en": "Default Level", "de": "Standard Level"},
      maps: [],
      instructions: {"en": "Default Instructions", "de": "Standard Anweisungen"}
    });
  }

  removeLevel(index: number) {
    this.levels.splice(index, 1);
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