import { Component, Input } from '@angular/core';
import { Question, ApiConfiguration } from '../../interfaces/questionnaire.type';
import { FormGroup } from '@angular/forms';

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

  questionTrackBy(index: number, question: Question): string {
    return question._id;
  }
}

