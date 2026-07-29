import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { TranslateDirective, TranslatePipe } from '@ngx-translate/core';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { StartComponent } from './start.component';
import { ImportConfigComponent } from '../import-config/import-config.component';

// Lazy-loaded route module for /config.
//
// The start page is the configuration landing, not the default route — the game is.
// With /configurator already lazy, StartComponent is the last eager consumer of
// MatSelect and MatFormField, so moving it out takes those (and the CDK overlay they
// pull in) off the initial payload. ImportConfigComponent is declared here because
// start.component.html is its only host.
const routes: Routes = [
	{ path: '', component: StartComponent },
];

@NgModule({
	declarations: [StartComponent, ImportConfigComponent],
	imports: [
		CommonModule,
		RouterModule.forChild(routes),
		MatButtonModule,
		MatFormFieldModule,
		MatSelectModule,
		TranslatePipe,
		TranslateDirective,
	],
})
export class StartModule { }
