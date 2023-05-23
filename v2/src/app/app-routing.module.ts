import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NavigationComponent } from './layout/navigation/navigation.component';
import { ConfiguratorComponent } from './configurator/configurator.component';
import { LevelComponent } from './level/level.component';

const routes: Routes = [
	{
		path: '',
		component: NavigationComponent
	},
	{
		path: 'game',
		component: LevelComponent
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
