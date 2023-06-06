import { Component } from '@angular/core';

@Component({
  selector: 'tro-configurator',
  templateUrl: './configurator.component.html',
  styleUrls: ['./configurator.component.scss']
})
export class ConfiguratorComponent {
  private _selected: "grid" | "svg" = "grid";
  get selected(): "grid" | "svg" {
    return this._selected;
  }
  set selected(selected: "grid" | "svg") {
    this._selected = selected;
  }

  maps = [{}];
  agircultureTypes = [{}];



  addMap() {
    this.maps.push({});
  }


}
