import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Layout1Component } from './layout/layout1/layout1.component';
import { NavigationComponent } from './layout/navigation/navigation.component';
import { ConfiguratorComponent } from './configurator/configurator.component';

const routes: Routes = [
	{
		path: '',
		component: NavigationComponent
	},
	{
		path: 'layout1',
		component: Layout1Component
	}, {
		path: 'configurator',
		component: ConfiguratorComponent
	}
];

@NgModule({
	imports: [RouterModule.forRoot(routes)],
	exports: [RouterModule]
})
export class AppRoutingModule { }
