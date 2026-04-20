import {
  Component,
  EventEmitter,
  Input,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { Section, ApiConfiguration } from '../../interfaces/questionnaire.type';
import { FormGroup } from '@angular/forms';
import { MainComponent } from '../main/main.component';
import { CardsQuestionsComponent } from '../cards-questions/cards-questions.component';

@Component({
  selector: 'lib-section-tabs',
  templateUrl: './section-tabs.component.html',
  styleUrls: ['./section-tabs.component.scss'],
})
export class SectionTabsComponent {
  @Input() sections: Section[];
  @Input() questionnaireForm: FormGroup;
  @Input() isSubmitted: boolean;
  @Input() isExpired: boolean;
  @Input() fileSizeLimit: any;
  @Input() apiConfig: ApiConfiguration;
  private _sectionIndex: number = 0;

  @Input()
  get sectionIndex(): number {
    return this._sectionIndex;
  }
  set sectionIndex(value: number) {
    if (this._sectionIndex !== value) {
      this._sectionIndex = value;
      this.sectionIndexChange.emit(value);
    }
  }

  @Output() sectionIndexChange = new EventEmitter<number>();
  @Output() tabChange = new EventEmitter<number>();

  @ViewChildren('mainComponent')
  public mainComponents: QueryList<MainComponent | CardsQuestionsComponent>;

  onTabChange(event: any) {
    const newIndex = event.index;
    if (newIndex !== undefined && newIndex !== this._sectionIndex) {
      this._sectionIndex = newIndex;
      this.sectionIndexChange.emit(newIndex);
      this.tabChange.emit(newIndex);
    }
  }

  getCurrentMainComponent(): MainComponent | CardsQuestionsComponent | undefined {
    if (!this.mainComponents || this.mainComponents.length === 0) {
      return undefined;
    }
    const components = this.mainComponents.toArray();
    return components[this.sectionIndex] || components[0];
  }
}

