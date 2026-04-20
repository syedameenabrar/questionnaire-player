import { Component, Input, ViewChild } from '@angular/core';
import { Question, ApiConfiguration } from '../../interfaces/questionnaire.type';
import { FormGroup } from '@angular/forms';
import { PageQuestionsGridComponent } from '../page-questions-grid/page-questions-grid.component';

@Component({
  selector: 'lib-cards-questions',
  templateUrl: './cards-questions.component.html',
  styleUrls: ['./cards-questions.component.scss'],
})
export class CardsQuestionsComponent {
  @Input({ required: true }) questions: Array<Question>;
  @Input() isSubmitted: boolean;
  @Input({ required: true }) questionnaireForm: FormGroup;
  @Input() fileUploadResponse;
  @Input() fileSizeLimit;
  @Input() apiConfig: ApiConfiguration;
  @Input() isExpired: boolean;
  @ViewChild('pageQuestionsGrid') pageQuestionsGridComponent: PageQuestionsGridComponent;

  questionTrackBy(index: number, question: Question): string {
    return question._id;
  }

  get pageIndex(): number {
    return this.pageQuestionsGridComponent?.currentPageIndex ?? 0;
  }

  set pageIndex(value: number) {
    if (this.pageQuestionsGridComponent) {
      this.pageQuestionsGridComponent.currentPageIndex = value;
    }
  }

  enableRelevantPage(questionId?: string): void {
    this.pageQuestionsGridComponent?.enableRelevantPage(questionId);
  }

  handlePageEvent(e: any): void {
    this.pageQuestionsGridComponent?.handlePageEvent(e);
  }
}

