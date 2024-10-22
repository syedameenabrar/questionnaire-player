import { booleanAttribute, ChangeDetectorRef, Component, Input, OnInit, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import * as urlConfig from '../../constants/url-config.json';
import { MatDialog } from '@angular/material/dialog';
import { ToastService } from '../../services/toast.service';
import { catchError } from 'rxjs';
import { ApiConfiguration } from '../../interfaces/questionnaire.type';
import {
  Chart,
  PieController,
  BarController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';

Chart.register(PieController, BarController, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

@Component({
  selector: 'lib-report',
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.css']
})
export class ReportComponent implements OnInit {

  reportDetails: any[] = [];
  objectURL: any;
  objectType!: string;
  isModalOpen: boolean = false;
  isFilterModalOpen: boolean = false;
  filteredQuestions: any[] = [];
  allQuestions: any[] = [];
  surveyName!: string;
  objectKeys = Object.keys;
  submissionId: any;
  @Input() apiConfig: ApiConfiguration;
  @Input({ transform: booleanAttribute }) angular = false;
  resultData = [];
  totalSubmissions: any;
  observationId: any;
  observationType: any = 'questions'

  constructor(
    private router: Router,
    public apiService: ApiService,
    public toaster: ToastService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      this.angular &&
      changes['apiConfig']
    ) {
      this.setApiService();
      this.submissionId = "66e03d1cbe48d96e6842d25d";
      this.setApiService();
      if (this.submissionId) {
        this.loadObservationReport(this.submissionId, false);
      }
    }
  }

  setApiService() {
    this.apiService.baseUrl = this.apiConfig.baseURL;
    this.apiService.token = this.apiConfig.userAuthToken;
    this.apiService.solutionType = this.apiConfig.solutionType;
  }


  loadObservationReport(submissionId: string, criteria: any) {
    this.resultData = [];
    this.surveyName = '';
    this.totalSubmissions = [];
    this.observationId = [];
    this.allQuestions = [];
    this.reportDetails = [];

    let payload = {
      "submissionId": submissionId,
      "observation": true,
      "entityType": "school",
      "pdf": false,
      "criteriaWise": criteria
    };

    this.apiService.post(urlConfig.survey.reportUrl, payload)
      .pipe(
        catchError((err) => {
          throw new Error('Could not fetch the details');
        })
      )
      .subscribe((res: any) => {
        this.resultData = res?.result?.result;
        this.surveyName = res?.result?.solutionName;
        this.totalSubmissions = res?.result?.totalSubmissions;
        this.observationId = res?.result?.observationId;
        this.allQuestions = res?.result?.reportSections;
        this.reportDetails = this.processSurveyData(this.allQuestions);
        this.cdr.detectChanges();
        this.renderCharts(this.reportDetails);
      });
  }

  processSurveyData(data: any): any[] {
    const mapAnswersToLabels = (answers: any[], options: any[]) => {

      return answers.map((answer: any) => {
        if (typeof answer === 'string') {
          const trimmedAnswer = answer.trim();
          if (trimmedAnswer === '') {
            return 'No response is available';
          }

          const option = options?.find((opt: { value: any }) => opt?.value === trimmedAnswer);
          return option ? option?.label : trimmedAnswer;
        }
        return answer;
      });
    };

    const processInstanceQuestions = (instance: any) => {
      const processedInstance = { ...instance };
      for (const key in processedInstance) {
        if (key !== 'instanceIdentifier') {
          processedInstance[key].answers = mapAnswersToLabels(
            processedInstance[key].answers,
            processedInstance[key].options
          );
          delete processedInstance[key].options;
        }
      }
      return processedInstance;
    };

    if (this.observationType === 'questions') {
      return data.map((question) => {

        if (question.responseType === 'matrix' && question?.instanceQuestions) {
          const processedInstanceQuestions = question?.instanceQuestions.map(processInstanceQuestions);
          return { ...question, instanceQuestions: processedInstanceQuestions };
        } else {
          const processedQuestion = { ...question };

          processedQuestion.answers = mapAnswersToLabels(question?.answers, question?.options);
          delete processedQuestion?.options;
          return processedQuestion;
        }return
      });
    } else {

       return data.map((criterias) => {
        let criteria = criterias?.questionArray
        return criteria.map((question) => {

          if (question?.responseType === 'matrix' && question?.instanceQuestions) {
            const processedInstanceQuestions = question?.instanceQuestions.map(processInstanceQuestions);
            return { ...question, instanceQuestions: processedInstanceQuestions };
          } else {
            const processedQuestion = { ...question };
            processedQuestion.answers = mapAnswersToLabels(question?.answers, question?.options);
            delete processedQuestion?.options;
            return processedQuestion;
          }
        });
      });
    }
  }

  renderCharts(reportDetails: any[]) {
    const canvases = document.querySelectorAll('.chart-canvas');

    canvases.forEach((canvas, index) => {
      if (canvas instanceof HTMLCanvasElement) {
        const question = reportDetails[index];
        if (question?.chart) {
          const chartType = question?.chart?.type === 'horizontalBar' ? 'bar' : question?.chart?.type;
          const chartOptions = question?.chart?.options || {};
          if (chartType === 'bar' && question?.chart?.type === 'horizontalBar') {
            chartOptions.indexAxis = 'y';
            chartOptions.maintainAspectRatio = true;
            chartOptions.scales = {
              x: {
                beginAtZero: true,
                ticks: {
                  autoSkip: false,
                  maxRotation: 0,
                  minRotation: 0
                }
              },
              y: {
                beginAtZero: true,
                ticks: {
                  autoSkip: false
                }
              }
            };

            chartOptions.plugins = {
              datalabels: {
                display: true,
              },
              legend: {
                display: false,
              },
              tooltip: {
                enabled: true
              },
            };
          } else if (chartType === 'bar') {
            chartOptions.maintainAspectRatio = true;
            chartOptions.scales = {
              x: {
                beginAtZero: true,
                ticks: {
                  autoSkip: false,
                  maxRotation: 0,
                  minRotation: 0
                }
              },
              y: {
                beginAtZero: true,
                ticks: {
                  autoSkip: false
                }
              }
            };
            chartOptions.plugins = {
              datalabels: {
                display: true,
              },
              legend: {
                display: false,
              },
              tooltip: {
                enabled: true
              },
            };
          }

          chartOptions.datasets = [{
            barThickness: 15,
            maxBarThickness: 20,
          }];


          new Chart(canvas, {
            type: chartType,
            data: question?.chart?.data,
            options: chartOptions
          });
        }
      } else {
        console.warn(`Element at index ${index} is not a canvas!`);
      }
    });
  }

  openDialog(url: string, type: string) {
    this.objectURL = url;
    this.objectType = type;
    this.isModalOpen = true;
  }

  closeDialog() {
    this.isModalOpen = false;
  }

  openFilter() {
    this.isFilterModalOpen = true;
  }

  closeFilter() {
    this.isFilterModalOpen = false;
  }

  updateFilteredQuestions() {
    this.filteredQuestions = this.allQuestions.filter(question => question.selected);
  }

  checkAnswerValue(answer: any): string | number {
    if (typeof answer === 'string') {
      return answer.trim() === '' ? 'NA' : answer;
    }
    return answer;
  }

  applyFilter(reset: boolean = false) {
    this.updateFilteredQuestions();

    const questionsToProcess = this.filteredQuestions.length > 0 ? this.filteredQuestions : this.allQuestions;
    this.reportDetails = this.processSurveyData(questionsToProcess);

    if (!reset && this.filteredQuestions.length === 0) {
      this.toaster.showToast('Select at least one question', 'danger');
    }

    if (reset || this.filteredQuestions.length > 0) {
      this.closeFilter();
    }
  }

  resetFilter() {
    this.allQuestions.forEach(question => question.selected = false);
    this.filteredQuestions = [];
    this.applyFilter(true);
  }

  goBack() {
    this.router.navigate(['/previous-page']); // Update with the correct route
  }

  openUrl(url: string) {
    window.open(url, '_blank');
  }

  isChartNotEmpty(chart: any): boolean {
    return chart && Object.keys(chart).length > 0;
  }

  toggleObservationType(type: any) {
    this.observationType = type;
    type == 'questions' ? this.loadObservationReport(this.submissionId, false) : this.loadObservationReport(this.submissionId, true);
  }
}