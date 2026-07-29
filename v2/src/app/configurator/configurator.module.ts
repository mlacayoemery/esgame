import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { TranslateDirective, TranslatePipe } from '@ngx-translate/core';

import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatStepperModule } from '@angular/material/stepper';

import { ConfiguratorComponent } from './configurator.component';

// Lazy-loaded route module for /configurator.
//
// The configurator is the only consumer of MatStepper, MatInput, MatCheckbox and
// MatSlider, and it is not on the path any player takes to the game — it is an
// authoring tool. Keeping it out of the initial bundle is what brings the app back
// under its 1 MB budget. MatFormField / MatSelect / MatIcon / MatButton are shared
// with eagerly-loaded components, so they stay in the common chunk; importing them
// here does not duplicate them.
const routes: Routes = [
	{ path: '', component: ConfiguratorComponent },
];

@NgModule({
	declarations: [ConfiguratorComponent],
	imports: [
		CommonModule,
		ReactiveFormsModule,
		RouterModule.forChild(routes),
		MatButtonModule,
		MatCheckboxModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatSelectModule,
		MatSliderModule,
		MatStepperModule,
		TranslatePipe,
		TranslateDirective,
	],
})
export class ConfiguratorModule { }
