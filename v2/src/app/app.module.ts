import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ConfigService } from './services/config.service';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { GridFieldComponent } from './field/grid-field/grid-field.component';
import { ProductionTypeButtonComponent } from './product-type-button/production-type-button.component';
import { ScoreBoardComponent } from './score-board/score-board.component';
import { LegendBoardComponent } from './legend-board/legend-board.component';
import { ButtonDirective } from './shared/button.directive';
import { HelpComponent } from './help/help.component';
import { ScoreIndicatorComponent } from './score-indicator/score-indicator.component';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatStepperModule } from '@angular/material/stepper';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSliderModule } from '@angular/material/slider';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MissingTranslationHandler, MissingTranslationHandlerParams, provideMissingTranslationHandler, provideTranslateService, TranslateDirective, TranslatePipe } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { HttpClientModule } from '@angular/common/http';
import { ConfiguratorComponent } from './configurator/configurator.component';
import { SvgGameBoardComponent } from './game-board/svg-game-board/svg-game-board.component';
import { GridGameBoardComponent } from './game-board/grid-game-board/grid-game-board.component';
import { SvgFieldComponent } from './field/svg-field/svg-field.component';
import { GridLevelComponent } from './level/grid-level/grid-level.component';
import { SvgLevelComponent } from './level/svg-level/svg-level.component';
import { LoadingIndicatorComponent } from './loading-indicator/loading-indicator.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LevelIndicatorComponent } from './level-indicator/level-indicator.component';
import { ImportConfigComponent } from './import-config/import-config.component';
import { StartComponent } from './start/start.component';
import { HomeComponent } from './home/home.component';

export class MyMissingTranslationHandler implements MissingTranslationHandler {
	handle(params: MissingTranslationHandlerParams): any {
	  return params.key;
	}
  }

@NgModule({
	declarations: [
		AppComponent,
		GridFieldComponent,
		ProductionTypeButtonComponent,
		ScoreBoardComponent,
		LegendBoardComponent,
		ButtonDirective,
		HelpComponent,
		ScoreIndicatorComponent,
		ConfiguratorComponent,
		SvgFieldComponent,
		SvgGameBoardComponent,
		GridGameBoardComponent,
		GridLevelComponent,
		SvgLevelComponent,
		LoadingIndicatorComponent,
		LevelIndicatorComponent,
		ImportConfigComponent,
  		StartComponent,
		HomeComponent,
	],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		AppRoutingModule,
		HttpClientModule,
		MatSelectModule,
		MatInputModule,
		MatIconModule,
		MatDividerModule,
		MatButtonModule,
		MatSliderModule,
		MatFormFieldModule,
		MatProgressSpinnerModule,
		MatCheckboxModule,
		FormsModule,
		ReactiveFormsModule,
		MatStepperModule,
		TranslatePipe,
		TranslateDirective,
	],
	providers: [
		provideTranslateService({
			fallbackLang: 'de',
			loader: provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
			missingTranslationHandler: provideMissingTranslationHandler(MyMissingTranslationHandler),
		}),
		{
			provide: APP_INITIALIZER,
			useFactory: (config: ConfigService) => () => config.load(),
			deps: [ConfigService],
			multi: true
		}
	],
	bootstrap: [AppComponent]
})
export class AppModule { }

